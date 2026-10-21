/** The modes definition's recipe (S16b): its parse, its check against the definition, and a `modes` change entry recorded and verified. */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { recordVerb, verifyVerb } from "../../src/corpus/instrument.ts";
import { parseModesRecipe } from "../../src/corpus/modes-recipe.ts";
import {
  ENTRY_SCHEMA,
  entryText,
  FIXTURE_MODES,
  type FixtureEntry,
  type FixtureValue,
} from "../fixtures/chain.ts";
import { RECORDED, writeFixtureCorpus } from "../fixtures/corpus-disk.ts";

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

const RULING =
  'The starting definition, under the operator\'s rulings of 2026-10-04: "cool then lock everything in"';

/** A recipe accounting for a definition's text, every part a method account unless changed. */
function recipeFor(definition: string, parts?: readonly object[]): string {
  return `${JSON.stringify(
    {
      schema: "greenline.modes-recipe/v1",
      definition: { path: "runtime/modes.json", sha256: sha256(definition) },
      parts: parts ?? [
        ...[
          "kind:step",
          "kind:start",
          "kind:habit",
          "steps",
          "mode:quick",
          "mode:careful",
          "floors",
        ].map((part) => ({ part, kind: "method", reason: `the ${part} part`, ruling: RULING })),
      ],
    },
    null,
    2,
  )}\n`;
}

/** A fixture corpus on disk with its two recorded entries and a modes recipe. */
function corpusWithRecipe(): string {
  const corpus = temporary("greenline-modes-");
  writeFixtureCorpus(corpus, { skillDirectory: true, recorded: true });
  writeFileSync(join(corpus, "recipes/modes.json"), recipeFor(FIXTURE_MODES));
  return corpus;
}

/** A `modes` change entry after the given predecessor, recording the recipe and the definition on disk. */
function modesEntry(corpus: string, id: string, previous: FixtureValue): string {
  const recipe = readFileSync(join(corpus, "recipes/modes.json"));
  const definition = readFileSync(join(corpus, "runtime/modes.json"));
  const entry: FixtureEntry = {
    schema: ENTRY_SCHEMA,
    id,
    kind: "change",
    subject: "modes",
    recipe: createHash("sha256").update(recipe).digest("hex"),
    result: createHash("sha256").update(definition).digest("hex"),
    pages: [{ path: "AGENTS.md" }, { path: "CLAUDE.md" }],
    gist: "The modes definition gets its recipe",
    reason: "The modes definition gets its recipe, so a reshape is ledgered.",
    authorisedBy: { date: "2026-10-04", words: RULING },
    ruling: [{ date: "2026-10-04", words: RULING }],
    measure: { stub: false, sources: [], growth: 0 },
  };
  return entryText(entry, previous);
}

function record(corpus: string, text: string) {
  const path = join(temporary("greenline-entry-"), "entry.json");
  writeFileSync(path, text);
  return recordVerb(corpus, path);
}

const TIP = { id: "2026-10-05-fixture-skill-recipe", sha256: sha256(RECORDED[1]?.text ?? "") };

/** A recipe as a test writes it, any field possibly wrong. */
interface WrittenRecipe {
  readonly schema: string;
  readonly definition: { readonly path: string; readonly sha256: string };
  readonly parts: readonly {
    readonly part: string;
    readonly kind: string;
    readonly reason: string;
    readonly ruling?: string;
    readonly gist?: string;
    readonly excess?: { readonly words?: number; readonly ruling?: string };
  }[];
  readonly extra?: number;
}

describe("S16b the modes recipe's parse", () => {
  const issues = (value: WrittenRecipe): readonly string[] => {
    const parsed = parseModesRecipe(JSON.stringify(value), "modes.json");
    return parsed._tag === "err"
      ? parsed.error.issues.map((issue) => `${issue.path}: ${issue.message}`)
      : [];
  };
  const base = {
    schema: "greenline.modes-recipe/v1",
    definition: { path: "runtime/modes.json", sha256: "a".repeat(64) },
    parts: [{ part: "steps", kind: "correction", reason: "r" }],
  };

  it("S16b takes a recipe of accounts, a ruling exactly on a method account", () => {
    expect(issues(base)).toEqual([]);
    expect(
      issues({ ...base, parts: [{ part: "mode:fast", kind: "method", reason: "r", ruling: "w" }] }),
    ).toEqual([]);
  });

  it("S16b refuses another schema, an unknown field, a part of no form, a part twice and a ruling out of place", () => {
    expect(issues({ ...base, schema: "greenline.recipe/v1" })).toHaveLength(1);
    expect(issues({ ...base, extra: 1 })).toHaveLength(1);
    expect(
      issues({ ...base, parts: [{ part: "depths", kind: "method", reason: "r", ruling: "w" }] }),
    ).toEqual(["parts[0].part: a part is kind:<name>, steps, mode:<name> or floors"]);
    expect(
      issues({ ...base, parts: [...base.parts, { part: "steps", kind: "name", reason: "again" }] }),
    ).toEqual(["parts[1].part: the part 'steps' is accounted for twice"]);
    expect(issues({ ...base, parts: [{ part: "floors", kind: "method", reason: "r" }] })).toEqual([
      "parts[0].ruling: a method account carries the operator's ruling",
    ]);
    expect(
      issues({ ...base, parts: [{ part: "floors", kind: "scope", reason: "r", ruling: "w" }] }),
    ).toEqual(["parts[0].ruling: only a method account carries a ruling"]);
  });
});

describe("S23 the modes recipe's ruling on a mode's excess of words", () => {
  const recipeText = (parts: WrittenRecipe["parts"]): string =>
    JSON.stringify({
      schema: "greenline.modes-recipe/v1",
      definition: { path: "runtime/modes.json", sha256: "a".repeat(64) },
      parts,
    });
  const issues = (parts: WrittenRecipe["parts"]): readonly string[] => {
    const parsed = parseModesRecipe(recipeText(parts), "modes.json");
    return parsed._tag === "err"
      ? parsed.error.issues.map((issue) => `${issue.path}: ${issue.message}`)
      : [];
  };
  const mode = { part: "mode:careful", kind: "method", reason: "r", ruling: "w" };
  const excess = { words: 120, ruling: 'The operator\'s words: "keep the extra pass"' };

  it("S23 a mode's account carries the excess its ruling names, in words, with the operator's words", () => {
    const steps = { part: "steps", kind: "correction", reason: "r" };
    const parsed = parseModesRecipe(recipeText([{ ...mode, excess }, steps]), "modes.json");
    expect(parsed._tag === "ok" ? parsed.value.parts : []).toEqual([{ ...mode, excess }, steps]);
  });

  it("S23 refuses an excess on an account that is not a mode's, below one word, not whole, or without its ruling", () => {
    expect(issues([{ part: "steps", kind: "method", reason: "r", ruling: "w", excess }])).toEqual([
      "parts[0].excess: only a mode's account names an excess of words over its budget",
    ]);
    expect(issues([{ ...mode, excess: { ...excess, words: 0 } }])).toEqual([
      "parts[0].excess.words: Too small: expected number to be >=1",
    ]);
    expect(issues([{ ...mode, excess: { ...excess, words: 12.5 } }])).toEqual([
      "parts[0].excess.words: Invalid input: expected int, received number",
    ]);
    expect(issues([{ ...mode, excess: { words: 120 } }])).toEqual([
      "parts[0].excess.ruling: Invalid input: expected string, received undefined",
    ]);
    expect(issues([{ ...mode, excess: { ...excess, ruling: "" } }])).toEqual([
      "parts[0].excess.ruling: Too small: expected string to have >=1 characters",
    ]);
  });

  it("S1 a part's account keeps its gist, and a gist outside the rule is refused", () => {
    const gisted = { ...mode, gist: "Keeps the careful mode's extra pass" };
    const parsed = parseModesRecipe(recipeText([gisted]), "modes.json");
    expect(parsed._tag === "ok" ? parsed.value.parts : []).toEqual([gisted]);
    expect(issues([{ ...mode }, { part: "steps", kind: "scope", reason: "r" }]).length).toBe(0);
    expect(
      issues([
        { ...mode, gist: "Keeps the careful mode's extra pass." },
        { ...mode, part: "floors", gist: "a · b — c" },
      ]),
    ).toEqual([
      "parts[0].gist: a gist ends without a full stop",
      "parts[1].gist: a gist carries no middle dot",
      "parts[1].gist: a gist carries no em dash",
    ]);
  });
});

describe("S16b a modes change entry records a reshape", () => {
  it("S16b record writes a modes entry that states the recipe and the definition, and verify then passes", () => {
    const corpus = corpusWithRecipe();
    const before = verifyVerb(corpus, ["modes"]);
    expect(before.output.ledger).toEqual([
      {
        skill: "modes",
        message: "no change entry records the recipe; no changes happen unledgered",
      },
    ]);
    const first = modesEntry(corpus, "2026-10-08-modes-recipe", TIP);
    expect(record(corpus, first).output.refused).toEqual([]);
    const verified = verifyVerb(corpus, ["modes"]);
    expect(verified.failed).toBe(false);
    expect(verified.output.verified).toEqual(["modes"]);
    expect(verifyVerb(corpus, []).output.ledger).toEqual([]);
  });

  it("S16b a reshape of the definition is refused until the recipe accounts for it, then until an entry records it", () => {
    const corpus = corpusWithRecipe();
    const first = modesEntry(corpus, "2026-10-08-modes-recipe", TIP);
    expect(record(corpus, first).output.refused).toEqual([]);
    // Reshape: the quick mode's outline runs inline.
    const outlined = FIXTURE_MODES.replace(
      '"outline": {\n          "depth": "none"\n        }',
      '"outline": {\n          "depth": "inline"\n        }',
    );
    expect(outlined).not.toBe(FIXTURE_MODES);
    writeFileSync(join(corpus, "runtime/modes.json"), outlined);
    const stale = verifyVerb(corpus, ["modes"]);
    expect(stale.output.refused).toEqual([
      {
        skill: "modes",
        issues: [
          {
            message: `the recipe accounts for the definition ${sha256(FIXTURE_MODES)}; corpus/runtime/modes.json is ${sha256(outlined)}: account for the change and state the new digest`,
          },
        ],
      },
    ]);
    writeFileSync(join(corpus, "recipes/modes.json"), recipeFor(outlined));
    const unrecorded = verifyVerb(corpus, ["modes"]);
    expect(unrecorded.output.ledger.map((finding) => finding.message)).toEqual([
      expect.stringMatching(
        /^it records the recipe [a-f0-9]{64}; the recipe on disk is [a-f0-9]{64}$/,
      ),
      expect.stringMatching(
        /^it records the result [a-f0-9]{64}; the recipe renders [a-f0-9]{64}$/,
      ),
    ]);
    // The second entry restates the first's ruling and adds none, so it names no ruling of its own (J-66).
    const restated = JSON.parse(
      modesEntry(corpus, "2026-10-08-quick-outlines", {
        id: "2026-10-08-modes-recipe",
        sha256: sha256(first),
      }),
    );
    restated.authorisedBy = null;
    const second = `${JSON.stringify(restated, null, 2)}\n`;
    expect(record(corpus, second).output.refused).toEqual([]);
    expect(verifyVerb(corpus, ["modes"]).failed).toBe(false);
  });

  it("S16b refuses a recipe that leaves a part unaccounted or accounts for a part the definition lacks", () => {
    const corpus = corpusWithRecipe();
    writeFileSync(
      join(corpus, "recipes/modes.json"),
      recipeFor(FIXTURE_MODES, [
        { part: "kind:step", kind: "method", reason: "r", ruling: RULING },
        { part: "mode:sure", kind: "method", reason: "r", ruling: RULING },
      ]),
    );
    const messages = verifyVerb(corpus, ["modes"]).output.refused.flatMap((refusal) =>
      refusal.issues.map((issue) => issue.message),
    );
    expect(messages).toEqual([
      "the part 'kind:start' of the definition has no account in the recipe",
      "the part 'kind:habit' of the definition has no account in the recipe",
      "the part 'steps' of the definition has no account in the recipe",
      "the part 'mode:quick' of the definition has no account in the recipe",
      "the part 'mode:careful' of the definition has no account in the recipe",
      "the part 'floors' of the definition has no account in the recipe",
      "the recipe accounts for 'mode:sure', which the definition does not hold",
    ]);
  });

  it("S16b a modes entry with a method account and no ruling is refused, and one with no recipe on disk", () => {
    const corpus = corpusWithRecipe();
    const unruled = JSON.parse(modesEntry(corpus, "2026-10-08-modes-recipe", TIP));
    unruled.ruling = [];
    unruled.authorisedBy = null;
    expect(record(corpus, `${JSON.stringify(unruled, null, 2)}\n`).output.refused).toEqual([
      expect.objectContaining({
        message: "a recipe with a method item needs the operator's ruling",
      }),
    ]);
    const entry = modesEntry(corpus, "2026-10-08-modes-recipe", TIP);
    rmSync(join(corpus, "recipes/modes.json"));
    expect(record(corpus, entry).output.refused).toEqual([
      expect.objectContaining({
        message:
          "the tree holds no recipe for the modes, corpus/recipes/modes.json, so its entry cannot be checked",
      }),
    ]);
  });

  it("S16b verify refuses a modes recipe gone from the tree while the chain records it", () => {
    const corpus = corpusWithRecipe();
    expect(
      record(corpus, modesEntry(corpus, "2026-10-08-modes-recipe", TIP)).output.refused,
    ).toEqual([]);
    rmSync(join(corpus, "recipes/modes.json"));
    const outcome = verifyVerb(corpus, []);
    expect(outcome.failed).toBe(true);
    // The fixture's one skill recipe; the missing modes recipe is not counted.
    expect(outcome.output.recipes).toBe(1);
    expect(outcome.output.refused).toContainEqual({
      skill: "modes",
      issues: [
        {
          message:
            "the entry '2026-10-08-modes-recipe' records the modes recipe, and there is no corpus/recipes/modes.json",
        },
      ],
    });
  });

  it("S16b the real definition's recipe is recorded by its latest modes entry and verifies", () => {
    const outcome = verifyVerb(join(repository, "corpus"), ["modes"]);
    expect(outcome.output.refused).toEqual([]);
    expect(outcome.output.ledger).toEqual([]);
    expect(outcome.output.verified).toEqual(["modes"]);
  });
});
