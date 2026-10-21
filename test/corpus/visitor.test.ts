/**
 * What the ledger shows a visitor (J-66): each entry's authorising ruling
 * before its cumulative list, each change's installed pages, the index's
 * legend and its marked retention, and the line view telling an absorbed
 * source from a pending candidate and naming each skill's latest pages.
 */
import { describe, expect, it } from "vitest";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";
import {
  parseChain,
  parseEntry,
  serializeEntry,
  type Chain,
  type RulingItem,
} from "../../src/corpus/chain.ts";
import { authorityIssues } from "../../src/corpus/record.ts";
import { renderViews, type NoticeSource, type ViewsInput } from "../../src/corpus/views.ts";
import {
  chainTexts,
  entryText,
  fixtureEntries,
  fixturePlacement,
  fixtureRetirement,
  FIXTURE_MODES,
  OLD_TIP,
  STUB_RULING,
  STUB_SOURCES,
  type FixtureEntry,
} from "../fixtures/chain.ts";
import { COMMIT, CREDITED, REPOSITORY, SOURCE, UPSTREAM_LICENCE } from "../fixtures/recipe.ts";

const encoder = new TextEncoder();

function chainOf(entries: readonly FixtureEntry[]): Chain {
  const chain = parseChain(
    chainTexts(entries).map(({ name, text }) => ({ name, bytes: encoder.encode(text) })),
  );
  if (chain._tag === "err") throw chain.error;
  return chain.value;
}

/** The issues parsing one entry gives, as `path: message` lines; none when it parses. */
function parseIssues(entry: FixtureEntry): readonly string[] {
  const parsed = parseEntry(entryText(entry, { oldChain: { ...OLD_TIP } }), "entry.json");
  return parsed._tag === "err"
    ? parsed.error.issues.map((issue) => `${issue.path}: ${issue.message}`)
    : [];
}

function at(entries: FixtureEntry[], index: number): FixtureEntry {
  const entry = entries[index];
  if (entry === undefined) throw new Error(`the fixture holds an entry at ${index}`);
  return entry;
}

function definition(): ModesDefinition {
  const parsed = parseModes(FIXTURE_MODES, "corpus/runtime/modes.json");
  if (parsed._tag === "err") throw parsed.error;
  return parsed.value;
}

const PINNED: NoticeSource = {
  name: SOURCE,
  repo: REPOSITORY,
  commit: COMMIT,
  snapshot: `upstream/${SOURCE}/${COMMIT}`,
  licence: UPSTREAM_LICENCE,
};
const HELD: NoticeSource = {
  name: CREDITED,
  repo: "https://example.com/fixture-credited",
  commit: "c".repeat(40),
  snapshot: `upstream/${CREDITED}/${"c".repeat(40)}`,
  holder: "Copyright (c) 2026 Credited Author",
};

/** The text of one view rendered from a chain of the given entries over the fixture's manifest. */
function view(entries: readonly FixtureEntry[], path: string): string {
  const input: ViewsInput = {
    chain: chainOf(entries),
    definition: definition(),
    recipeSources: new Map([["tiny-skill", STUB_SOURCES]]),
    sources: [PINNED, HELD],
    skills: [
      { name: "fixture-skill", kind: "step", slot: "check" },
      { name: "tiny-skill", kind: "habit", extra: true },
    ],
  };
  const views = renderViews(input);
  if (views._tag === "err") throw views.error;
  return views.value.find((each) => each.path === path)?.text ?? "";
}

const LATER: RulingItem = { date: "2026-10-09", words: "The later fixture ruling" };

describe("the entry's authorising ruling and pages", () => {
  it("writes the pages after the result in path order, and the authorising ruling before the list", () => {
    const entries = fixtureEntries();
    const change = at(entries, 2);
    change["pages"] = [{ path: "references/b.md" }, { path: "SKILL.md" }];
    const parsed = parseEntry(entryText(change, { oldChain: { ...OLD_TIP } }), "entry.json");
    if (parsed._tag === "err") throw parsed.error;
    const keys = Object.keys(JSON.parse(serializeEntry(parsed.value)));
    expect(keys).toEqual([
      "schema",
      "id",
      "kind",
      "previous",
      "subject",
      "recipe",
      "result",
      "pages",
      "gist",
      "reason",
      "authorisedBy",
      "ruling",
      "measure",
    ]);
    if (parsed.value.kind !== "change") throw new Error("the fixture's third entry is a change");
    expect(parsed.value.pages).toEqual([{ path: "references/b.md" }, { path: "SKILL.md" }]);
    expect(JSON.parse(serializeEntry(parsed.value)).pages).toEqual([
      { path: "SKILL.md" },
      { path: "references/b.md" },
    ]);
  });

  it("accepts unknown for both fields, null for the ruling and an empty list of pages", () => {
    const entries = fixtureEntries();
    const change = at(entries, 2);
    change["pages"] = "unknown";
    change["authorisedBy"] = "unknown";
    expect(parseIssues(change)).toEqual([]);
    change["pages"] = [];
    change["authorisedBy"] = null;
    expect(parseIssues(change)).toEqual([]);
  });

  it("refuses an authorising ruling that is no item of the list, a page named twice or outside its directory, and either field missing", () => {
    const entries = fixtureEntries();
    const change = at(entries, 2);
    change["authorisedBy"] = { date: STUB_RULING.date, words: "Other words" };
    change["pages"] = [{ path: "SKILL.md" }, { path: "SKILL.md" }, { path: "../AGENTS.md" }];
    expect(parseIssues(change)).toEqual([
      "pages[2].path: a page's path is relative, with no . or .. part",
      "authorisedBy: the authorising ruling is an item of the entry's ruling list, by date and words",
      "pages: the page 'SKILL.md' is named twice",
    ]);
    change["pages"] = [{ path: "SKILL.md" }, { path: "notes.md" }];
    expect(parseIssues(change)).toEqual([
      "authorisedBy: the authorising ruling is an item of the entry's ruling list, by date and words",
    ]);
    change["pages"] = [{ path: "SKILL.md" }, { path: "SKILL.md" }];
    expect(parseIssues(change)).toEqual([
      "authorisedBy: the authorising ruling is an item of the entry's ruling list, by date and words",
      "pages: the page 'SKILL.md' is named twice",
    ]);
    delete change["pages"];
    delete change["authorisedBy"];
    expect(parseIssues(change).map((issue) => issue.split(":")[0])).toEqual([
      "pages",
      "authorisedBy",
    ]);
  });

  it("refuses a source or a retirement entry whose authorising ruling is no item of its list", () => {
    const entries = fixtureEntries();
    const source = at(entries, 0);
    source["authorisedBy"] = { ...STUB_RULING };
    expect(parseIssues(source)).toEqual([
      "authorisedBy: the authorising ruling is an item of the entry's ruling list, by date and words",
    ]);
    source["pages"] = [];
    expect(parseIssues(source)).toContain(': Unrecognized key: "pages"');
  });
});

describe("record's checks of the two fields on a new entry", () => {
  /** The chain of the first three fixture entries and a later change of the tiny skill. */
  function later(change: (entry: FixtureEntry) => void): readonly string[] {
    const entries = fixtureEntries().slice(0, 3);
    const chain = chainOf(entries);
    const next = structuredClone(at(entries, 2));
    next.id = "2026-10-09-tiny-skill-later";
    next["ruling"] = [{ ...STUB_RULING }, { ...LATER }];
    next["authorisedBy"] = { ...LATER };
    next["pages"] = [{ path: "SKILL.md" }];
    change(next);
    const parsed = parseEntry(entryText(next, { oldChain: { ...OLD_TIP } }), "next.json");
    if (parsed._tag === "err") throw parsed.error;
    return authorityIssues(parsed.value, chain);
  }

  it("accepts a change naming the ruling it appends", () => {
    expect(later(() => undefined)).toEqual([]);
  });

  it("refuses unknown for either field, which only the entries recorded before them carry", () => {
    expect(
      later((entry) => {
        entry["authorisedBy"] = "unknown";
        entry["pages"] = "unknown";
      }),
    ).toEqual([
      "its authorising ruling is unknown, which is kept for the entries recorded before the field; a new entry states the ruling or null",
      "its pages are unknown, which is kept for the entries recorded before the field; a new entry states the pages it touched",
    ]);
  });

  it("refuses null on a change that appends a ruling, and a ruling inherited from its subject's previous change", () => {
    expect(
      later((entry) => {
        entry["authorisedBy"] = null;
      }),
    ).toEqual([
      "it adds a ruling of its own, so it names the one that authorised it in authorisedBy",
    ]);
    expect(
      later((entry) => {
        entry["authorisedBy"] = { ...STUB_RULING };
      }),
    ).toEqual([
      "its authorising ruling of 2026-10-06 is inherited from its subject's previous change entry; it names one of the items it adds",
    ]);
  });

  it("accepts null on a change that appends none, and refuses an inherited ruling there, so null means no ruling of its own", () => {
    expect(
      later((entry) => {
        entry["ruling"] = [{ ...STUB_RULING }];
        entry["authorisedBy"] = null;
      }),
    ).toEqual([]);
    expect(
      later((entry) => {
        entry["ruling"] = [{ ...STUB_RULING }];
        entry["authorisedBy"] = { ...STUB_RULING };
      }),
    ).toEqual([
      "its authorising ruling of 2026-10-06 is inherited from its subject's previous change entry, and it adds none of its own, so it names null",
    ]);
  });

  it("reads a source's or a retirement's whole list as its own: null is refused beside a ruling, and an item of the list accepted", () => {
    const entries = fixtureEntries().slice(0, 3);
    const chain = chainOf(entries);
    const checked = (entry: FixtureEntry): readonly string[] => {
      const parsed = parseEntry(entryText(entry, { oldChain: { ...OLD_TIP } }), "next.json");
      if (parsed._tag === "err") throw parsed.error;
      return authorityIssues(parsed.value, chain);
    };
    const source = structuredClone(at(fixtureEntries(), 3));
    source.id = "2026-10-09-other-read-again";
    source["ruling"] = [{ ...LATER }];
    expect(checked(source)).toEqual([
      "it adds a ruling of its own, so it names the one that authorised it in authorisedBy",
    ]);
    source["authorisedBy"] = { ...LATER };
    expect(checked(source)).toEqual([]);
    const retirement = fixtureRetirement();
    retirement["authorisedBy"] = null;
    expect(checked(retirement)).toEqual([
      "it adds a ruling of its own, so it names the one that authorised it in authorisedBy",
    ]);
  });
});

describe("the index a visitor reads", () => {
  it("opens with a legend defining every line and column an entry prints", () => {
    const index = view(fixtureEntries(), "corpus/ledger/INDEX.md");
    const legend = (index.split("## How to read an entry\n")[1] ?? "").split("\n## ")[0] ?? "";
    for (const term of [
      "Gist:",
      "Authorised by:",
      "Rulings:",
      "Pages:",
      "Source:",
      "Segments:",
      "Taken:",
      "Exact:",
      "Retention:",
      "Coverage:",
      "Credit line:",
      "Written words, the whole skill's:",
      "Mode:",
      "Step:",
      "Depth:",
      "Cost in words:",
      "Handed to:",
      "It loads:",
    ])
      expect([term, legend.includes(`- ${term}`)]).toEqual([term, true]);
    expect(legend).toContain("It is not the size of the change.");
    expect(index).not.toContain("Growth:");
  });

  it("marks a retention under the minimum in its row", () => {
    const entries = fixtureEntries();
    const change = at(entries, 1);
    change["measure"] = {
      stub: false,
      sources: [
        {
          source: SOURCE,
          segments: 12,
          taken: 11,
          exact: 10,
          retention: 0.5,
          coverage: 11 / 12,
          meetsMinimum: false,
          creditLine: false,
        },
      ],
      growth: 7,
    };
    change["ruling"] = [{ ...STUB_RULING }];
    change["authorisedBy"] = { ...STUB_RULING };
    expect(view(entries, "corpus/ledger/INDEX.md")).toContain(
      "| 50.0%, under the 90% minimum | 91.7%    | no          |",
    );
  });

  it("shows the authorising ruling first, then the cumulative list, in each of its three forms", () => {
    const entries = fixtureEntries();
    const index = view(entries, "corpus/ledger/INDEX.md");
    expect(index).toContain(
      "Authorised by: 2026-10-06: Tiny only delegates, so it is a stub\n\nRulings, cumulative:\n\n- 2026-10-06: Tiny only delegates, so it is a stub\n",
    );
    expect(index).toContain("Authorised by: no ruling of its own.\n\nNo ruling is recorded.\n");
    at(entries, 2)["authorisedBy"] = "unknown";
    expect(view(entries, "corpus/ledger/INDEX.md")).toContain(
      "Authorised by: not recorded. The entry was recorded before the ledger kept this field, with several rulings of its own, and its record does not say which one authorised it.\n\nRulings, cumulative:",
    );
  });

  it("names each change's pages, none, or unknown", () => {
    const entries = fixtureEntries();
    expect(view(entries, "corpus/ledger/INDEX.md")).toContain(
      "Pages: `SKILL.md`, `notes.md`, `scripts/run.sh`.",
    );
    at(entries, 1)["pages"] = [];
    at(entries, 2)["pages"] = "unknown";
    const index = view(entries, "corpus/ledger/INDEX.md");
    expect(index).toContain("Pages: none. The change touched no installed page.");
    expect(index).toContain(
      "Pages: unknown. The entry was recorded before the ledger kept this field, and its record does not show them.",
    );
  });
});

describe("the line a visitor reads", () => {
  /** The fixture entries with a second source on the check step that a hold keeps pending. */
  function withHeld(catches: string): FixtureEntry[] {
    const entries = fixtureEntries();
    const placement = fixturePlacement();
    placement["catches"] = catches;
    entries.push({
      ...structuredClone(at(entries, 3)),
      id: "2026-10-08-held-read",
      source: { repository: "https://example.com/held", commit: "f".repeat(40), path: "." },
      licence: "mit",
      verdict: "copy",
      gist: "Its method is placed on the check step",
      reason: "Its method is placed on the check step.",
      placement,
    });
    entries.push({
      ...structuredClone(at(entries, 3)),
      id: "2026-10-09-held-held",
      source: { repository: "https://example.com/held", commit: "f".repeat(40), path: "." },
      licence: "mit",
      verdict: "hold",
      gist: "Its method waits for the re-cut",
      reason: "Its method waits for the re-cut.",
    });
    return entries;
  }

  function checkRow(line: string): string[] {
    const row = line.split("\n").find((each) => each.startsWith("| `check`"));
    return (row ?? "")
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim());
  }

  it("lists an absorbed source apart from a pending candidate", () => {
    const line = view(withHeld("A held catch."), "corpus/ledger/LINE.md");
    const header = line.split("\n").find((each) => each.startsWith("| Slot")) ?? "";
    expect(header).toContain("| Absorbed ");
    const row = checkRow(line);
    expect(row[5]).toBe(
      "`fixture-upstream/fixture` (`copy`, `strengthen`): A fixture change whose check cannot fail.",
    );
    expect(row[6]).toBe("`https://example.com/held` (`hold`, `strengthen`): A held catch.");
  });

  it("marks a combine candidate only among pending candidates, since an absorbed source has entered already", () => {
    const shared = "A fixture change whose check cannot fail.";
    expect(checkRow(view(withHeld(shared), "corpus/ledger/LINE.md"))[7]).toBe("");
    const entries = withHeld(shared);
    const absorbed = at(entries, 0);
    entries.push({
      ...structuredClone(at(entries, 3)),
      id: "2026-10-10-fixture-upstream-held",
      source: structuredClone(absorbed["source"] ?? null),
      pin: SOURCE,
      licence: "mit",
      verdict: "hold",
      gist: "The fixture method waits too",
      reason: "The fixture method waits too.",
    });
    expect(checkRow(view(entries, "corpus/ledger/LINE.md"))[7]).toBe(
      "combine candidate: 2 candidates share a catch",
    );
  });

  it("names each roster skill's latest change and the pages it touched", () => {
    const entries = fixtureEntries();
    at(entries, 2)["pages"] = "unknown";
    const line = view(entries, "corpus/ledger/LINE.md");
    const pages = line.split("## The pages\n")[1] ?? "";
    expect(pages).toContain(
      "| `fixture-skill` | `2026-10-05-fixture-skill-recipe` | `SKILL.md`, `notes.md`, `scripts/run.sh` |",
    );
    expect(pages).toContain("| `tiny-skill`    | `2026-10-06-tiny-skill-stub`      | unknown");
  });
});
