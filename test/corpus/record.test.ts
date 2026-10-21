/** The fresh chain's writer and checks (`record`, `verify`'s ledger checks, `views`) on a fixture corpus on disk, and the `corpus` gate row. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { recordVerb, verifyVerb, viewsVerb } from "../../src/corpus/instrument.ts";
import {
  chainTexts,
  ENTRY_SCHEMA,
  entryText,
  fixtureEntries,
  fixturePlacement,
  fixtureRetirement,
  OLD_TIP,
  RECIPE_DIGEST,
  type FixtureEntry,
  type FixtureObject,
  type FixtureValue,
} from "../fixtures/chain.ts";
import { RECORDED, writeFixtureCorpus, writeTree } from "../fixtures/corpus-disk.ts";
import { COMMIT, fixtureRecipe, REPOSITORY } from "../fixtures/recipe.ts";

const repository = join(import.meta.dirname, "..", "..");
const made: string[] = [];
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

afterEach(() => {
  for (const directory of made.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function temporary(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  made.push(directory);
  return directory;
}

/** A fixture corpus on disk, with its committed skill directory. */
function corpusOnDisk(recorded: boolean): string {
  const corpus = temporary("greenline-chain-");
  writeFixtureCorpus(corpus, { skillDirectory: true, recorded });
  return corpus;
}

/** Every entry file under the corpus, by name, with its text. */
function entriesOf(corpus: string): Record<string, string> {
  const directory = join(corpus, "ledger/entries");
  if (!existsSync(directory)) return {};
  return Object.fromEntries(
    readdirSync(directory).map((name) => [name, readFileSync(join(directory, name), "utf8")]),
  );
}

/** Write an entry to a file outside the corpus and record it. */
function record(corpus: string, text: string) {
  const path = join(temporary("greenline-entry-"), "entry.json");
  writeFileSync(path, text);
  return recordVerb(corpus, path);
}

const TIP = { id: "2026-10-05-fixture-skill-recipe", sha256: sha256(RECORDED[1]?.text ?? "") };

/** A further change entry for the fixture skill, after the recorded tip, changed by `change`. */
function nextChange(change: (entry: FixtureEntry) => void = () => {}): string {
  const [, entry] = fixtureEntries();
  if (entry === undefined) throw new Error("the fixture holds a change");
  entry.id = "2026-10-08-fixture-skill-again";
  change(entry);
  return entryText(entry, { ...TIP });
}

describe("record", () => {
  it("appends the first entry citing the old chain, then the fixture skill's change, each in canonical bytes", () => {
    const corpus = corpusOnDisk(false);
    for (const { name, text } of RECORDED) {
      const id = name.replace(/\.json$/, "");
      // Handed over compact; written in the canonical form.
      expect(record(corpus, JSON.stringify(JSON.parse(text)))).toEqual({
        output: {
          verb: "record",
          entry: id,
          wrote: `corpus/ledger/entries/${name}`,
          refused: [],
        },
        failed: false,
      });
      expect(entriesOf(corpus)[name]).toBe(text);
    }
    expect(verifyVerb(corpus, []).output).toMatchObject({
      entries: 2,
      tip: { id: TIP.id, sha256: sha256(RECORDED[1]?.text ?? "") },
      ledger: [],
    });
  });

  it.each<[string, () => string, readonly string[]]>([
    [
      "a predecessor that is not the tip",
      () => {
        const [first, , , other] = fixtureEntries();
        if (first === undefined || other === undefined) throw new Error("entries");
        return entryText(other, { id: first.id, sha256: sha256(RECORDED[0]?.text ?? "") });
      },
      [
        `its predecessor is 2026-10-04-fixture-upstream-read at ${sha256(RECORDED[0]?.text ?? "")}; the tip is ${TIP.id} at ${TIP.sha256}`,
      ],
    ],
    [
      "the tip named at another digest",
      () => {
        const [, , , other] = fixtureEntries();
        if (other === undefined) throw new Error("entries");
        return entryText(other, { id: TIP.id, sha256: "0".repeat(64) });
      },
      [`its predecessor is ${TIP.id} at ${"0".repeat(64)}; the tip is ${TIP.id} at ${TIP.sha256}`],
    ],
    [
      "a second entry citing the old chain",
      () => {
        const [, , , other] = fixtureEntries();
        if (other === undefined) throw new Error("entries");
        return entryText(other, { oldChain: { ...OLD_TIP } });
      },
      [`only the first entry cites the old chain; the tip is ${TIP.id} at ${TIP.sha256}`],
    ],
    [
      "an entry recorded already",
      () => {
        const [, change] = fixtureEntries();
        if (change === undefined) throw new Error("entries");
        return entryText(change, { ...TIP });
      },
      ["it is recorded already, and an entry is never rewritten"],
    ],
    [
      "a wrong recipe digest",
      () => nextChange((entry) => (entry["recipe"] = "f".repeat(64))),
      [`it records the recipe ${"f".repeat(64)}; the recipe on disk is ${RECIPE_DIGEST}`],
    ],
    [
      "a wrong result digest",
      () => nextChange((entry) => (entry["result"] = "f".repeat(64))),
      [expect.stringContaining(`it records the result ${"f".repeat(64)}; the recipe renders `)],
    ],
    [
      "unknown pages and an unknown authorising ruling, which only the entries recorded before them carry (J-66)",
      () =>
        nextChange((entry) => {
          entry["pages"] = "unknown";
          entry["authorisedBy"] = "unknown";
        }),
      [
        "its authorising ruling is unknown, which is kept for the entries recorded before the field; a new entry states the ruling or null",
        "its pages are unknown, which is kept for the entries recorded before the field; a new entry states the pages it touched",
      ],
    ],
    [
      "a ruling of its own with no authorising ruling named (J-66)",
      () =>
        nextChange((entry) => {
          entry["ruling"] = [{ date: "2026-10-08", words: "The operator rules it" }];
        }),
      ["it adds a ruling of its own, so it names the one that authorised it in authorisedBy"],
    ],
    [
      "a wrong measure",
      () =>
        nextChange((entry) => {
          entry["measure"] = { stub: false, sources: [], growth: 7 };
        }),
      [expect.stringContaining('it records the measure {"stub":false,"sources":[],"growth":7}')],
    ],
    [
      "a measure under the minimum without the ruling",
      () =>
        nextChange((entry) => {
          entry["measure"] = {
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
        }),
      ["ruling: a measure under the retention minimum needs the operator's ruling"],
    ],
    [
      "a change to the block, which has no recipe yet",
      () => nextChange((entry) => (entry["subject"] = "block")),
      [
        "the tree holds no recipe for the block yet, so its entry cannot be checked; it is recorded once its recipe exists",
      ],
    ],
    [
      "a change to a skill with no recipe",
      () => nextChange((entry) => (entry["subject"] = "skill:no-such-skill")),
      ["no recipe 'corpus/recipes/no-such-skill.json' for 'no-such-skill'"],
    ],
    [
      "a source entry pinned to a source the manifest does not pin",
      () => {
        const [read] = fixtureEntries();
        if (read === undefined) throw new Error("entries");
        read.id = "2026-10-08-unpinned-read";
        read["pin"] = "no-such-source";
        return entryText(read, { ...TIP });
      },
      ["the manifest pins no source 'no-such-source'"],
    ],
    [
      "a source entry whose pin names another commit",
      () => {
        const [read] = fixtureEntries();
        if (read === undefined) throw new Error("entries");
        read.id = "2026-10-08-other-commit-read";
        read["source"] = { repository: REPOSITORY, commit: "9".repeat(40), path: "fixture" };
        return entryText(read, { ...TIP });
      },
      [
        `the manifest pins 'fixture-upstream' at ${REPOSITORY} ${COMMIT}, not ${REPOSITORY} ${"9".repeat(40)}`,
      ],
    ],
  ])("refuses %s and writes nothing", (_name, text, messages) => {
    const corpus = corpusOnDisk(true);
    const before = entriesOf(corpus);
    const outcome = record(corpus, text());
    expect(outcome.failed).toBe(true);
    expect(outcome.output.entry).toBeNull();
    expect(outcome.output.refused.map((issue) => issue.message)).toEqual(messages);
    expect(entriesOf(corpus)).toEqual(before);
  });

  it("refuses a first entry that does not cite the old chain", () => {
    const corpus = corpusOnDisk(false);
    const [read] = fixtureEntries();
    if (read === undefined) throw new Error("entries");
    expect(
      record(corpus, entryText(read, { id: "2026-10-01-elsewhere", sha256: "0".repeat(64) })).output
        .refused,
    ).toEqual([
      {
        entry: "2026-10-04-fixture-upstream-read",
        message: "the chain is empty, so the first entry cites the old chain's tip",
      },
    ]);
    expect(entriesOf(corpus)).toEqual({});
  });

  it("refuses a recipe with a method item until its entry carries the operator's ruling", () => {
    const corpus = corpusOnDisk(true);
    const recipe = fixtureRecipe();
    const taken = recipe.files[0]?.passages[0];
    const edit = taken?.passage === "taken" ? taken.edits?.[0] : undefined;
    if (edit === undefined) throw new Error("the fixture recipe holds an edit");
    edit.kind = "method";
    edit.ruling = "The operator rules the restatement.";
    const text = `${JSON.stringify(recipe, null, 2)}\n`;
    writeFileSync(join(corpus, "recipes/fixture-skill.json"), text);
    const unruled = nextChange((entry) => (entry["recipe"] = sha256(text)));
    expect(record(corpus, unruled).output.refused).toEqual([
      {
        entry: "2026-10-08-fixture-skill-again",
        message: "a recipe with a method item needs the operator's ruling",
      },
    ]);
    const ruled = nextChange((entry) => {
      entry["recipe"] = sha256(text);
      entry["ruling"] = [{ date: "2026-10-08", words: "The operator rules the restatement" }];
      entry["authorisedBy"] = { date: "2026-10-08", words: "The operator rules the restatement" };
    });
    expect(record(corpus, ruled).failed).toBe(false);
    expect(verifyVerb(corpus, ["fixture-skill"]).failed).toBe(false);
  });
});

describe("S8b: record refuses a long reason, a handoff with no recipient and a dropped ruling", () => {
  /** A repository holding the fixture corpus, with `entries` recorded in place of the fixture's two, and the workshop's craft pages named. */
  function repositoryWith(entries: readonly FixtureEntry[], crafts: readonly string[] = []) {
    const root = temporary("greenline-record-");
    const corpus = join(root, "corpus");
    writeFixtureCorpus(corpus, { skillDirectory: true, recorded: false });
    const texts = chainTexts(entries);
    writeTree(
      corpus,
      new Map(texts.map(({ name, text }) => [`ledger/entries/${name}`, text] as const)),
    );
    for (const craft of crafts)
      writeTree(root, new Map([[`workshop/skills/${craft}/SKILL.md`, `# ${craft}\n`]]));
    const last = texts.at(-1);
    const tip = { id: last?.name.replace(/\.json$/, "") ?? "", sha256: sha256(last?.text ?? "") };
    return { corpus, tip };
  }

  /** The fixture's entry at an index: the copy, then the skill's change. */
  function fixture(index: number): FixtureEntry {
    const entry = fixtureEntries()[index];
    if (entry === undefined) throw new Error("the fixture holds entries");
    return entry;
  }
  const [read, change] = [fixture(0), fixture(1)];

  /** A further change of the fixture skill in the new form, with its ruling list. */
  function againWith(
    ruling: readonly { readonly date: string; readonly words: string }[],
    tip: FixtureValue,
    id = "2026-10-12-fixture-skill-again",
  ): string {
    // The last item is the one this change appends, so it is the one that authorised it.
    const last = ruling.at(-1);
    return entryText(
      {
        ...structuredClone(change),
        id,
        authorisedBy: last === undefined ? null : { ...last },
        ruling: structuredClone([...ruling]),
      },
      tip,
    );
  }

  /** The messages of a refused record, which writes nothing. */
  function refused(corpus: string, text: string): readonly string[] {
    const before = entriesOf(corpus);
    const outcome = record(corpus, text);
    expect(entriesOf(corpus)).toEqual(before);
    return outcome.output.refused.map((issue) => issue.message);
  }

  it("S8c: refuses an entry of the old form, which no longer parses, and the chain still verifies", () => {
    const corpus = corpusOnDisk(true);
    const { gist: _gist, ruling: _ruling, ...rest } = structuredClone(change);
    const old = entryText(
      { ...rest, schema: "greenline.entry/v1", id: "2026-10-12-old-form" },
      { ...TIP },
    );
    expect(refused(corpus, old)).toEqual([
      'schema: Invalid input: expected "greenline.entry/v2"',
      "gist: Invalid input: expected string, received undefined",
      "ruling: Invalid input: expected array, received undefined",
    ]);
    expect(verifyVerb(corpus, []).output).toMatchObject({ entries: 2, chain: [], ledger: [] });
  });

  it("refuses a reason of more than two sentences or more than 40 words", () => {
    const corpus = corpusOnDisk(true);
    const long = (reason: string) =>
      entryText(
        { ...structuredClone(change), id: "2026-10-12-fixture-skill-again", reason },
        {
          ...TIP,
        },
      );
    expect(refused(corpus, long("It moves. It renders. It fits."))).toEqual([
      "reason: a reason holds at most two sentences, and this one holds 3",
    ]);
    expect(refused(corpus, long(`It moves ${"again ".repeat(39).trim()}.`))).toEqual([
      "reason: a reason holds at most 40 words, and this one holds 41",
    ]);
  });

  describe("a handoff", () => {
    /** An unpinned source handed off, after the tip, with its handoff. */
    function handedOff(handoff: FixtureObject | undefined, tip: FixtureValue): string {
      const entry: FixtureEntry = {
        schema: ENTRY_SCHEMA,
        id: "2026-10-12-other-handed-off",
        kind: "source",
        source: { repository: "https://example.com/other", commit: "b".repeat(40), path: "." },
        licence: "ideas-only",
        verdict: "hand-off",
        gist: "Its caching rules are garden's knowledge",
        reason: "Its caching rules are knowledge consulted for an engineering choice.",
        authorisedBy: null,
        ruling: [],
      };
      if (handoff !== undefined) entry["handoff"] = handoff;
      return entryText(entry, tip);
    }
    const parts = [{ part: "its caching rules", locator: "SKILL.md, the caching section" }];

    it("refuses a hand-off with no recipient", () => {
      const { corpus, tip } = repositoryWith([read, change]);
      expect(refused(corpus, handedOff(undefined, tip))).toEqual([
        "handoff: a hand-off carries its handoff; a handoff names its recipient: garden, or a workshop craft by its page name, craft-<name>",
      ]);
      expect(refused(corpus, handedOff({ parts }, tip))).toEqual([
        "handoff.recipient: a handoff names its recipient: garden, or a workshop craft by its page name, craft-<name>",
      ]);
    });

    it("refuses a craft whose page the workshop does not hold, and records one it holds, and garden", () => {
      const { corpus, tip } = repositoryWith([read, change], ["craft-thread-audit"]);
      expect(refused(corpus, handedOff({ recipient: "craft-no-such-page", parts }, tip))).toEqual([
        "the handoff's recipient 'craft-no-such-page' is no craft page of the workshop, workshop/skills/craft-no-such-page/SKILL.md",
      ]);
      expect(
        record(corpus, handedOff({ recipient: "craft-thread-audit", parts }, tip)).output.refused,
      ).toEqual([]);
      const garden = repositoryWith([read, change]);
      expect(
        record(garden.corpus, handedOff({ recipient: "garden", parts }, garden.tip)).output.refused,
      ).toEqual([]);
    });
  });

  describe("the ruling list of a change entry", () => {
    const first = { date: "2026-10-08", words: 'R1, "yes": the first ruling; with its clause' };
    const second = { date: "2026-10-12", words: "R2: the second ruling." };

    it("refuses a list that drops an item of its subject's previous change entry's list, and records one that restates it and appends", () => {
      const { corpus, tip } = repositoryWith([read, { ...change, ruling: [first] }]);
      expect(refused(corpus, againWith([second], tip))).toEqual([
        `its ruling list drops the item of 2026-10-08, 'R1, "yes": the first ruling; with its clause', which ${change.id}, its subject's previous change entry, carries; a change entry restates that list and appends its own item`,
      ]);
      expect(
        refused(corpus, againWith([{ ...first, date: "2026-10-09" }, second], tip)),
      ).toHaveLength(1);
      expect(record(corpus, againWith([first, second], tip)).output.refused).toEqual([]);
    });

    it("keeps nothing for a subject's first change entry, and compares only the same subject", () => {
      const { corpus, tip } = repositoryWith([read]);
      expect(
        record(corpus, entryText({ ...structuredClone(change), ruling: [] }, tip)).output.refused,
      ).toEqual([]);
    });
  });
});

describe("S13: record's retirement checks, against the manifest and the tree on disk", () => {
  /** The fixture skill's retirement after the recorded tip, changed by `change`. */
  function retirement(change: (entry: FixtureEntry) => void = () => {}): string {
    const entry = fixtureRetirement();
    change(entry);
    return entryText(entry, { ...TIP });
  }

  /** Take the fixture skill off the corpus: its manifest entry, which the heir replaces, its recipe and its directory. */
  function retireOnDisk(corpus: string, parts = { manifest: true, recipe: true, directory: true }) {
    if (parts.manifest) {
      const path = join(corpus, "manifest.json");
      // SAFETY: the fixture writes the manifest, an object with skills and intents.
      const manifest = JSON.parse(readFileSync(path, "utf8")) as FixtureObject;
      manifest["skills"] = [{ name: "fixture-heir", kind: "step", slot: "check" }];
      manifest["intents"] = [{ intent: "the fixture", skills: ["fixture-heir"] }];
      writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    if (parts.recipe) rmSync(join(corpus, "recipes/fixture-skill.json"));
    if (parts.directory) rmSync(join(corpus, "skills/fixture-skill"), { recursive: true });
  }

  it("refuses a retirement while the manifest lists the skill and its recipe and directory remain, and writes nothing", () => {
    const corpus = corpusOnDisk(true);
    const before = entriesOf(corpus);
    expect(record(corpus, retirement()).output.refused).toEqual([
      {
        entry: "2026-10-08-fixture-skill-retired",
        message:
          "the manifest still lists the skill 'fixture-skill'; a retirement follows its removal",
      },
      {
        entry: "2026-10-08-fixture-skill-retired",
        message:
          "the recipe corpus/recipes/fixture-skill.json still exists; a retirement follows its removal",
      },
      {
        entry: "2026-10-08-fixture-skill-retired",
        message:
          "the skill directory corpus/skills/fixture-skill/ still exists; a retirement follows its removal",
      },
      {
        entry: "2026-10-08-fixture-skill-retired",
        message: "its replacement 'fixture-heir' is no skill the manifest lists",
      },
    ]);
    expect(entriesOf(corpus)).toEqual(before);
  });

  it.each<[string, { manifest: boolean; recipe: boolean; directory: boolean }, string]>([
    [
      "the recipe alone",
      { manifest: true, recipe: false, directory: true },
      "the recipe corpus/recipes/fixture-skill.json still exists; a retirement follows its removal",
    ],
    [
      "the directory alone",
      { manifest: true, recipe: true, directory: false },
      "the skill directory corpus/skills/fixture-skill/ still exists; a retirement follows its removal",
    ],
  ])("refuses a retirement that leaves %s behind", (_name, parts, message) => {
    const corpus = corpusOnDisk(true);
    retireOnDisk(corpus, parts);
    expect(record(corpus, retirement()).output.refused).toEqual([
      { entry: "2026-10-08-fixture-skill-retired", message },
    ]);
  });

  it("records a retirement once the skill has left, and verify and the views pass after it", () => {
    const corpus = corpusOnDisk(true);
    retireOnDisk(corpus);
    expect(record(corpus, retirement()).output).toEqual({
      verb: "record",
      entry: "2026-10-08-fixture-skill-retired",
      wrote: "corpus/ledger/entries/2026-10-08-fixture-skill-retired.json",
      refused: [],
    });
    expect(viewsVerb(corpus, true).failed).toBe(false);
    expect(verifyVerb(corpus, []).output).toMatchObject({ entries: 3, ledger: [], chain: [] });
  });

  it.each<[string, (entry: FixtureEntry) => void, string]>([
    [
      "a recipe digest other than the one its latest change records",
      (e) => (e["recipe"] = "0".repeat(64)),
      `it names the recipe ${"0".repeat(64)}; the latest change entry of 'fixture-skill' records ${RECIPE_DIGEST}`,
    ],
    [
      "a replacement the manifest does not list",
      (e) => (e["replacedBy"] = "fixture-ghost"),
      "its replacement 'fixture-ghost' is no skill the manifest lists",
    ],
    [
      "a skill the chain never recorded",
      (e) => (e["skill"] = "never-recorded"),
      "the chain records no change of the skill 'never-recorded', so there is nothing to retire",
    ],
  ])("refuses %s, and writes nothing", (_name, change, message) => {
    const corpus = corpusOnDisk(true);
    retireOnDisk(corpus);
    const before = entriesOf(corpus);
    expect(record(corpus, retirement(change)).output.refused).toEqual([
      { entry: "2026-10-08-fixture-skill-retired", message },
    ]);
    expect(entriesOf(corpus)).toEqual(before);
  });

  it("accepts a retirement no skill replaces, and refuses a second retirement of the same skill", () => {
    const corpus = corpusOnDisk(true);
    retireOnDisk(corpus);
    const first = retirement((e) => (e["replacedBy"] = null));
    expect(record(corpus, first).output.refused).toEqual([]);
    const again = fixtureRetirement();
    again.id = "2026-10-09-fixture-skill-retired-again";
    expect(
      record(
        corpus,
        entryText(again, { id: "2026-10-08-fixture-skill-retired", sha256: sha256(first) }),
      ).output.refused,
    ).toEqual([
      {
        entry: "2026-10-09-fixture-skill-retired-again",
        message:
          "the skill 'fixture-skill' is retired already, by 2026-10-08-fixture-skill-retired",
      },
    ]);
  });
});

describe("record's placement checks, against the modes definition on disk", () => {
  /** A copy of the fixture source after the recorded tip, its placement's rows changed by `change`. */
  function placedRead(change: (rows: FixtureObject[]) => void): string {
    const [read] = fixtureEntries();
    if (read === undefined) throw new Error("entries");
    read.id = "2026-10-08-fixture-upstream-placed";
    const placement = fixturePlacement();
    change(placement.modes);
    read["placement"] = placement;
    return entryText(read, { ...TIP });
  }

  it("records a placement whose every mode and step the definition holds", () => {
    const corpus = corpusOnDisk(true);
    const outcome = record(
      corpus,
      placedRead(() => {}),
    );
    expect(outcome.output.refused).toEqual([]);
    expect(outcome.output.entry).toBe("2026-10-08-fixture-upstream-placed");
  });

  it.each<[string, (rows: FixtureObject[]) => void, readonly string[]]>([
    [
      "a mode the definition lacks, though the corpus's own definition holds it",
      (rows) => {
        if (rows[0] !== undefined) rows[0]["mode"] = "fast";
      },
      [
        "the placement names the mode 'fast', which the modes definition does not hold",
        "the placement gives no row for the mode 'quick'",
      ],
    ],
    [
      "a step the definition lacks",
      (rows) => {
        if (rows[1] !== undefined) rows[1]["step"] = "review";
      },
      ["the placement names the step 'review', which the modes definition does not hold"],
    ],
    [
      "a mode named twice",
      (rows) => {
        if (rows[1] !== undefined) {
          rows[1]["mode"] = "quick";
          rows[1]["depth"] = "inline";
        }
      },
      [
        "the placement gives the mode 'quick' 2 rows",
        "the placement gives no row for the mode 'careful'",
      ],
    ],
    [
      "a mode left out",
      (rows) => {
        rows.splice(1, 1);
      },
      ["the placement gives no row for the mode 'careful'"],
    ],
    [
      "a depth other than the one the definition gives the step at that mode",
      (rows) => {
        if (rows[1] !== undefined) rows[1]["depth"] = "looped";
      },
      [
        "the placement gives the step 'check' at the mode 'careful' the depth 'looped'; the modes definition gives 'independent'",
      ],
    ],
    [
      "words added at a mode where the step does not run",
      (rows) => {
        if (rows[0] !== undefined) {
          rows[0]["step"] = "outline";
          rows[0]["depth"] = "none";
        }
      },
      ["the placement adds 40 words at the mode 'quick', where its step 'outline' does not run"],
    ],
  ])("refuses %s, by name, and writes nothing", (_name, change, messages) => {
    const corpus = corpusOnDisk(true);
    const before = entriesOf(corpus);
    const outcome = record(corpus, placedRead(change));
    expect(outcome.failed).toBe(true);
    expect(outcome.output.refused).toEqual(
      messages.map((message) => ({ entry: "2026-10-08-fixture-upstream-placed", message })),
    );
    expect(entriesOf(corpus)).toEqual(before);
  });

  it("refuses a placement when the corpus holds no modes definition, and reads none for an entry without one", () => {
    const corpus = corpusOnDisk(true);
    rmSync(join(corpus, "runtime/modes.json"));
    expect(
      record(
        corpus,
        placedRead(() => {}),
      ).output.refused.map((issue) => issue.message),
    ).toEqual([
      "the modes definition 'corpus/runtime/modes.json' is missing, so the placement cannot be checked",
    ]);
    writeFileSync(join(corpus, "runtime/modes.json"), '{"schemaVersion": 5, "steps": []}\n');
    expect(
      record(
        corpus,
        placedRead(() => {}),
      ).output.refused.map((issue) => issue.message),
    ).toContainEqual(expect.stringContaining("corpus/runtime/modes.json modes:"));
    const [, , , other] = fixtureEntries();
    if (other === undefined) throw new Error("entries");
    expect(record(corpus, entryText(other, { ...TIP })).output.refused).toEqual([]);
  });
});

describe("R4: record's slot checks, against the manifest and the modes definition on disk", () => {
  /** A lift of an unpinned source after the recorded tip, its placement's kind, slot and move changed. */
  function slotted(kind: string, slot: string, move: string): string {
    const entry: FixtureEntry = {
      schema: ENTRY_SCHEMA,
      id: "2026-10-08-fixture-slot-read",
      kind: "source",
      source: { repository: "https://example.com/slotted", commit: "f".repeat(40), path: "." },
      licence: "ideas-only",
      verdict: "lift",
      gist: "The method is written here",
      reason: "The method is written here in greenline's words.",
      authorisedBy: null,
      ruling: [],
      placement: {
        ...fixturePlacement(),
        kind,
        slot,
        move,
        boldest: { move: "reshape", needs: "A measured run at both modes." },
      },
    };
    return entryText(entry, { ...TIP });
  }

  it.each<[string, string, string]>([
    ["step", "outline", "fill"],
    ["step", "fixture-skill", "strengthen"],
    ["habit", "fixture-habit", "add"],
    ["step", "careful", "reshape"],
  ])(
    "records a %s placement on the slot '%s' by %s, and verify passes after it",
    (kind, slot, move) => {
      const corpus = corpusOnDisk(true);
      const outcome = record(corpus, slotted(kind, slot, move));
      expect(outcome.output.refused).toEqual([]);
      expect(viewsVerb(corpus, true).failed).toBe(false);
      expect(verifyVerb(corpus, []).failed).toBe(false);
    },
  );

  it.each<[string, string, string, string]>([
    [
      "step",
      "review",
      "fill",
      "the placement fills the slot 'review', which is no step of the modes definition",
    ],
    [
      "habit",
      "secrets",
      "strengthen",
      "the placement strengthens the slot 'secrets', which names no roster skill",
    ],
    [
      "habit",
      "fixture-skill",
      "add",
      "the placement adds the slot 'fixture-skill', which the roster skill of that name holds",
    ],
    [
      "step",
      "fast",
      "reshape",
      "the placement reshapes 'fast', which is no mode of the modes definition",
    ],
    [
      "gate",
      "fixture-skill",
      "strengthen",
      "the placement's kind 'gate' is no kind of the modes definition",
    ],
  ])(
    "refuses a %s placement on the slot '%s' by %s, naming it, and writes nothing",
    (kind, slot, move, message) => {
      const corpus = corpusOnDisk(true);
      const before = entriesOf(corpus);
      expect(record(corpus, slotted(kind, slot, move)).output.refused).toEqual([
        { entry: "2026-10-08-fixture-slot-read", message },
      ]);
      expect(entriesOf(corpus)).toEqual(before);
    },
  );

  it("accepts an add naming the roster skill whose recipe takes from the entry's pin", () => {
    const corpus = corpusOnDisk(true);
    const [read] = fixtureEntries();
    if (read === undefined) throw new Error("entries");
    read.id = "2026-10-08-fixture-upstream-added";
    read["placement"] = {
      ...fixturePlacement(),
      move: "add",
      boldest: { move: "add", needs: "A run." },
    };
    expect(record(corpus, entryText(read, { ...TIP })).output.refused).toEqual([]);
  });
});

describe("R4: verify's slot checks", () => {
  it("refuses a step skill whose slot names a step the modes definition lacks, by name", () => {
    const corpus = corpusOnDisk(true);
    expect(viewsVerb(corpus, true).failed).toBe(false);
    const path = join(corpus, "manifest.json");
    writeFileSync(path, readFileSync(path, "utf8").replace('"slot": "check"', '"slot": "review"'));
    const outcome = verifyVerb(corpus, []);
    expect(outcome.failed).toBe(true);
    expect(outcome.output.refused).toContainEqual({
      skill: "fixture-skill",
      issues: [{ message: "the slot 'review' names no step of the modes definition" }],
    });
  });
});

describe("R5: verify's kind checks, against the modes definition's kinds", () => {
  /** The corpus's manifest with its first skill's kind and slot changed. */
  function rekinded(corpus: string, kind: string, slot: string | undefined): void {
    const path = join(corpus, "manifest.json");
    // SAFETY: the fixture's manifest, written by the fixture, holds a skills array of named kinds.
    const manifest = JSON.parse(readFileSync(path, "utf8")) as {
      skills: { kind: string; slot?: string }[];
    };
    const [first] = manifest.skills;
    if (first === undefined) throw new Error("a skill");
    first.kind = kind;
    if (slot === undefined) delete first.slot;
    else first.slot = slot;
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  it("refuses a manifest skill whose kind the definition lacks, by name, and accepts it once the definition declares the kind", () => {
    const corpus = corpusOnDisk(true);
    rekinded(corpus, "gate", "check");
    expect(verifyVerb(corpus, []).output.refused).toContainEqual({
      skill: "fixture-skill",
      issues: [{ message: "the kind 'gate' is no kind of the modes definition" }],
    });
    const modesPath = join(corpus, "runtime/modes.json");
    // SAFETY: the fixture's modes definition, written by the fixture, declares its kinds as an array.
    const modes = JSON.parse(readFileSync(modesPath, "utf8")) as { kinds: object[] };
    modes.kinds.push({
      name: "gate",
      mechanism: "reach",
      record: "line",
      place: "ordered",
      budget: "free",
      when: "A fixture gate holds the change where the mode reaches it until its check passes.",
    });
    writeFileSync(modesPath, `${JSON.stringify(modes, null, 2)}\n`);
    expect(verifyVerb(corpus, []).output.refused).toEqual([]);
  });

  it("refuses a slot on a kind placed beside the line, and none on one placed on it", () => {
    const corpus = corpusOnDisk(true);
    rekinded(corpus, "habit", "check");
    expect(verifyVerb(corpus, []).output.refused).toContainEqual({
      skill: "fixture-skill",
      issues: [
        { message: "a habit is placed beside the line, so it is its own slot and names none" },
      ],
    });
    rekinded(corpus, "step", undefined);
    expect(verifyVerb(corpus, []).output.refused).toContainEqual({
      skill: "fixture-skill",
      issues: [
        {
          message:
            "a step is placed on the line, so it names its slot, a step of the modes definition",
        },
      ],
    });
  });
});

describe("verify's ledger checks", () => {
  it("fails on a recipe with no entry and passes once its change is recorded", () => {
    const corpus = corpusOnDisk(false);
    expect(verifyVerb(corpus, [])).toEqual({
      output: expect.objectContaining({
        verified: ["fixture-skill"],
        entries: 0,
        tip: null,
        chain: [],
        ledger: [
          {
            skill: "fixture-skill",
            message: "no change entry records the recipe; no changes happen unledgered",
          },
        ],
      }),
      failed: true,
    });
    for (const { text } of RECORDED) expect(record(corpus, text).failed).toBe(false);
    expect(verifyVerb(corpus, ["fixture-skill"]).failed).toBe(false);
  });

  it("fails on a recipe edited after its latest entry, even when it renders the same bytes", () => {
    const corpus = corpusOnDisk(true);
    const recipe = fixtureRecipe();
    const drop = recipe.drops[0];
    if (drop === undefined) throw new Error("the fixture recipe holds a drop");
    drop.reason = "a reason reworded";
    const text = `${JSON.stringify(recipe, null, 2)}\n`;
    writeFileSync(join(corpus, "recipes/fixture-skill.json"), text);
    expect(verifyVerb(corpus, [])).toEqual({
      output: expect.objectContaining({
        verified: ["fixture-skill"],
        ledger: [
          {
            skill: "fixture-skill",
            entry: "2026-10-05-fixture-skill-recipe",
            message: `it records the recipe ${RECIPE_DIGEST}; the recipe on disk is ${sha256(text)}`,
          },
        ],
      }),
      failed: true,
    });
  });

  it("refuses a recipe whose bytes are not UTF-8, so no two recipe files share one digest", () => {
    const corpus = corpusOnDisk(true);
    const path = join(corpus, "recipes/fixture-skill.json");
    const bytes = readFileSync(path);
    writeFileSync(path, Buffer.concat([bytes.subarray(0, -1), Buffer.from([0xff, 0x0a])]));
    expect(verifyVerb(corpus, []).output.refused).toEqual([
      {
        skill: "fixture-skill",
        issues: [{ message: "'corpus/recipes/fixture-skill.json' is not UTF-8 text" }],
      },
    ]);
  });

  it("fails on a chain that is not whole, naming the entry", () => {
    const corpus = corpusOnDisk(true);
    rmSync(join(corpus, "ledger/entries", RECORDED[0]?.name ?? ""));
    expect(verifyVerb(corpus, [])).toEqual({
      output: expect.objectContaining({
        entries: 1,
        tip: null,
        chain: [
          {
            entry: "2026-10-05-fixture-skill-recipe",
            message: "its predecessor '2026-10-04-fixture-upstream-read' is missing",
          },
        ],
      }),
      failed: true,
    });
  });
});

describe("views", () => {
  /** A repository holding the fixture corpus and its two entries; the frozen rows when asked. */
  function repositoryOnDisk(frozen?: string) {
    const root = temporary("greenline-views-");
    const corpus = join(root, "corpus");
    writeFixtureCorpus(corpus, { skillDirectory: true, recorded: true });
    if (frozen !== undefined)
      writeTree(corpus, new Map([["ledger/sources-before-the-ledger.md", frozen]]));
    return { root, corpus };
  }

  const PATHS = [
    "corpus/ledger/INDEX.md",
    "docs/SOURCES.md",
    "THIRD_PARTY_NOTICES.md",
    "corpus/NOTICE.md",
    "corpus/ledger/LINE.md",
  ];

  it("prints the five views and writes nothing without --write", () => {
    const { root, corpus } = repositoryOnDisk();
    const outcome = viewsVerb(corpus, false);
    expect(outcome.failed).toBe(false);
    expect(outcome.output.wrote).toEqual([]);
    expect(outcome.output.views.map((view) => view.path)).toEqual(PATHS);
    for (const path of PATHS) expect([path, existsSync(join(root, path))]).toEqual([path, false]);
  });

  it("writes each view at its path with --write, the register carrying the frozen rows", () => {
    const frozen = "| Source | Verdict |\n| ------ | ------- |\n| A book | read    |\n";
    const { root, corpus } = repositoryOnDisk(frozen);
    const outcome = viewsVerb(corpus, true);
    expect(outcome.output.wrote).toEqual(PATHS);
    for (const view of outcome.output.views)
      expect([view.path, readFileSync(join(root, view.path), "utf8")]).toEqual([
        view.path,
        view.text,
      ]);
    expect(readFileSync(join(root, "docs/SOURCES.md"), "utf8").endsWith(frozen)).toBe(true);
    expect(readFileSync(join(root, "corpus/ledger/INDEX.md"), "utf8")).toContain(
      "## 2026-10-05-fixture-skill-recipe",
    );
  });

  it("S8b: writes the outbox of handoffs too where the repository holds the workshop, and verify names it missing or edited", () => {
    const { root, corpus } = repositoryOnDisk();
    mkdirSync(join(root, "workshop"));
    const outcome = viewsVerb(corpus, true);
    expect(outcome.output.wrote).toEqual([...PATHS, "docs/HANDOFFS.md"]);
    expect(readFileSync(join(root, "docs/HANDOFFS.md"), "utf8")).toContain(
      "## Handed off\n\nNone yet.\n",
    );
    expect(verifyVerb(corpus, []).output.views).toEqual([]);
    writeFileSync(join(root, "docs/HANDOFFS.md"), "# Handoffs\n\nEdited by hand.\n");
    expect(verifyVerb(corpus, []).output.views).toEqual([
      {
        path: "docs/HANDOFFS.md",
        message: "the committed view differs from its rendering; run views --write",
      },
    ]);
    rmSync(join(root, "docs/HANDOFFS.md"));
    expect(verifyVerb(corpus, []).output.views).toEqual([
      { path: "docs/HANDOFFS.md", message: "the view is not committed; run views --write" },
    ]);
  });

  it("refuses a chain that is not whole and writes nothing", () => {
    const { root, corpus } = repositoryOnDisk();
    rmSync(join(corpus, "ledger/entries", RECORDED[0]?.name ?? ""));
    expect(viewsVerb(corpus, true)).toEqual({
      output: {
        verb: "views",
        views: [],
        wrote: [],
        refused: [
          "2026-10-05-fixture-skill-recipe: its predecessor '2026-10-04-fixture-upstream-read' is missing",
        ],
      },
      failed: true,
    });
    expect(existsSync(join(root, "docs/SOURCES.md"))).toBe(false);
  });
});

describe("the corpus gate row", () => {
  /** A tree holding the gate script, the instrument and its code, and the corpus `setup` writes. */
  function gateTree(setup: (root: string) => void): string {
    const root = temporary("greenline-corpus-row-");
    for (const path of [
      "scripts/check.mjs",
      "scripts/corpus.mjs",
      "scripts/lib/commit-subject.mjs",
      "scripts/lib/gate-outcome.mjs",
      "scripts/lib/name-boundary.mjs",
    ]) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      copyFileSync(join(repository, path), join(root, path));
    }
    symlinkSync(join(repository, "src"), join(root, "src"), "dir");
    symlinkSync(join(repository, "node_modules"), join(root, "node_modules"), "dir");
    setup(root);
    return root;
  }

  function runRow(root: string) {
    const run = spawnSync(process.execPath, ["scripts/check.mjs"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, CHECK_ROWS: "corpus" },
    });
    const line = run.stdout
      .split("\n")
      .find((text) => text.startsWith("corpus "))
      ?.replace(/\s+/g, " ");
    return { status: run.status, line, stdout: run.stdout };
  }

  it("passes on this tree, whose recipes are each recorded by a change entry and whose views are committed", () => {
    const result = runRow(
      gateTree((root) => {
        symlinkSync(join(repository, "corpus"), join(root, "corpus"), "dir");
        for (const view of ["docs/SOURCES.md", "THIRD_PARTY_NOTICES.md"]) {
          mkdirSync(dirname(join(root, view)), { recursive: true });
          copyFileSync(join(repository, view), join(root, view));
        }
      }),
    );
    expect(result.status).toBe(0);
    expect(result.line).toBe("corpus PASS");
    expect(result.stdout).not.toContain("nothing to verify");
  });

  it("passes on a corpus with no recipe and no entry, and says so", () => {
    const result = runRow(
      gateTree((root) => writeTree(join(root, "corpus"), new Map([["recipes/.keep", ""]]))),
    );
    expect(result.status).toBe(0);
    expect(result.line).toBe("corpus PASS");
    expect(result.stdout).toContain("corpus: no recipe and no entry on disk; nothing to verify");
  });

  it("fails on a copy holding an unrecorded recipe, and passes once its entries are recorded and its views written", () => {
    const root = gateTree((tree) =>
      writeFixtureCorpus(join(tree, "corpus"), { skillDirectory: true, recorded: false }),
    );
    const unrecorded = runRow(root);
    expect(unrecorded.status).toBe(1);
    expect(unrecorded.line).toBe(
      "corpus FAIL — corpus refused 6: fixture-skill: no change entry records the recipe; no changes happen unledgered; corpus/ledger/INDEX.md: the view is not committed; run views --write; docs/SOURCES.md: the view is not committed; run views --write; THIRD_PARTY_NOTICES.md: the view is not committed; run views --write; corpus/NOTICE.md: the view is not committed; run views --write; corpus/ledger/LINE.md: the view is not committed; run views --write",
    );
    writeTree(
      join(root, "corpus"),
      new Map(RECORDED.map(({ name, text }) => [`ledger/entries/${name}`, text] as const)),
    );
    expect(runRow(root).line).toBe(
      "corpus FAIL — corpus refused 5: corpus/ledger/INDEX.md: the view is not committed; run views --write; docs/SOURCES.md: the view is not committed; run views --write; THIRD_PARTY_NOTICES.md: the view is not committed; run views --write; corpus/NOTICE.md: the view is not committed; run views --write; corpus/ledger/LINE.md: the view is not committed; run views --write",
    );
    expect(viewsVerb(join(root, "corpus"), true).failed).toBe(false);
    const recorded = runRow(root);
    expect(recorded.status).toBe(0);
    expect(recorded.line).toBe("corpus PASS");
    expect(recorded.stdout).not.toContain("nothing to verify");
  });

  it("fails on a committed view edited by hand, naming it", () => {
    const root = gateTree((tree) =>
      writeFixtureCorpus(join(tree, "corpus"), { skillDirectory: true, recorded: true }),
    );
    expect(viewsVerb(join(root, "corpus"), true).failed).toBe(false);
    writeFileSync(join(root, "docs/SOURCES.md"), "# Sources\n\nEdited by hand.\n");
    const edited = runRow(root);
    expect(edited.status).toBe(1);
    expect(edited.line).toBe(
      "corpus FAIL — corpus refused 1: docs/SOURCES.md: the committed view differs from its rendering; run views --write",
    );
  });
});
