/** The phrase passage (J-194 S1): a written passage lifted verbatim from a phrase of a words source, its recorded edits, its home and its measure. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { WordsPhrase } from "../../src/core/corpus.ts";
import { verifyVerb, viewsVerb } from "../../src/corpus/instrument.ts";
import { measureRecipe } from "../../src/corpus/measure.ts";
import { checkRecipe, parseRecipe, type Snapshots } from "../../src/corpus/recipe.ts";
import { writeFixtureCorpus } from "../fixtures/corpus-disk.ts";
import { fixtureRecipe, fixtureSnapshots, type FixtureRecipe } from "../fixtures/recipe.ts";

const WORDS = "phrasebook-fixture";
const PHRASE = "Design the single test that breaks this design on day one.";
const HOME = "corpus/skills/fixture-skill/SKILL.md";

const DISMISSED: WordsPhrase = {
  id: "dismissed",
  text: "Be bold.",
  date: "2026-11-07",
  dismissed: { failure: "no situation the agent meets changes" },
};

const ELSEWHERE: WordsPhrase = {
  id: "elsewhere",
  text: "What would a principal architect immediately rewrite before even starting this?",
  date: "2026-11-07",
  where: ["corpus/skills/other-skill/method.md"],
};

const phrases: readonly WordsPhrase[] = [
  { id: "breaking-test", text: PHRASE, date: "2026-11-07", where: [HOME] },
  ELSEWHERE,
  DISMISSED,
];

const snapshots: Snapshots = { ...fixtureSnapshots, words: new Map([[WORDS, phrases]]) };

/** A passage as a test writes it into a recipe file, a phrase passage's fields among them. */
interface PassageJson {
  passage?: string;
  text?: string;
  kind?: string;
  reason?: string;
  ruling?: string;
  credits?: string[];
  phrase?: string;
  edits?: { find: string; replace: string; reason: string }[];
  source?: string;
  file?: string;
  segments?: string[];
}

/** A phrase passage as a recipe file states it. */
function phrasePassage(change: PassageJson = {}): PassageJson {
  return {
    passage: "written",
    text: PHRASE,
    kind: "method",
    reason: "the operator's phrase, lifted as written",
    ruling: "the operator's words of 2026-11-07: we should lift phrases as they are",
    credits: [WORDS],
    phrase: "breaking-test",
    ...change,
  };
}

/** The fixture recipe with a phrase passage appended to its SKILL.md and the words source listed. */
function withPhrase(passage: PassageJson = phrasePassage()): FixtureRecipe {
  const recipe = fixtureRecipe();
  recipe.sources.push(WORDS);
  // SAFETY: the fixture's passage type predates the phrase field; the recipe's parse reads the JSON.
  recipe.files[0]?.passages.push(passage as never);
  return recipe;
}

function parseIssues(recipe: FixtureRecipe): readonly string[] {
  const result = parseRecipe(JSON.stringify(recipe), "fixture.json");
  return result._tag === "ok"
    ? ["parsed"]
    : result.error.issues.map((issue) => `${issue.path}: ${issue.message}`);
}

function refusals(recipe: FixtureRecipe, at: Snapshots = snapshots): readonly string[] {
  const parsed = parseRecipe(JSON.stringify(recipe), "fixture.json");
  if (parsed._tag === "err") throw parsed.error;
  const checked = checkRecipe(parsed.value, at);
  return checked._tag === "ok" ? [] : checked.error.issues.map((issue) => issue.message);
}

describe("J-194 S1 the phrase passage's record", () => {
  it("parses a phrase passage, its edits each with a reason", () => {
    expect(
      parseIssues(
        withPhrase(
          phrasePassage({
            text: "Design the one test that breaks this design on day one.",
            edits: [{ find: "single", replace: "one", reason: "the step page's word" }],
          }),
        ),
      ),
    ).toEqual(["parsed"]);
  });

  it("refuses edits on a written passage that names no phrase, and a phrase passage crediting other than one source", () => {
    const { phrase: _phrase, ...plain } = phrasePassage({
      edits: [{ find: "single", replace: "one", reason: "a word" }],
    });
    expect(parseIssues(withPhrase(plain))).toEqual([
      "files[0].passages[4]: edits stand only on a phrase passage, which names its phrase",
    ]);
    expect(parseIssues(withPhrase(phrasePassage({ credits: [] })))).toContain(
      "files[0].passages[4].credits: a phrase passage credits exactly one source, its words source",
    );
  });
});

describe("J-194 S1 the phrase passage held verbatim to its phrase", () => {
  it("admits a phrase passage whose text is the phrase's", () => {
    expect(refusals(withPhrase())).toEqual([]);
  });

  it("refuses a phrase passage whose text drifts from the phrase with no edit recorded", () => {
    expect(
      refusals(
        withPhrase(phrasePassage({ text: "Design the one test that breaks it on day one." })),
      ),
    ).toEqual([
      `the phrase passage of 'SKILL.md' drifts from phrase 'breaking-test' of '${WORDS}' with no edit recorded: record each change as an edit with its reason, or lift the phrase as written`,
    ]);
  });

  it("admits a drift its recorded edits account for, and refuses an edit whose find text does not occur once", () => {
    const edited = "Design the one test that breaks this design on day one.";
    expect(
      refusals(
        withPhrase(
          phrasePassage({
            text: edited,
            edits: [{ find: "single", replace: "one", reason: "the step page's word" }],
          }),
        ),
      ),
    ).toEqual([]);
    expect(
      refusals(
        withPhrase(
          phrasePassage({
            text: edited,
            edits: [{ find: "es", replace: "one", reason: "twice in the phrase" }],
          }),
        ),
      ),
    ).toEqual([
      `an edit of phrase 'breaking-test' of '${WORDS}' finds 'es', which does not occur exactly once`,
    ]);
  });

  it("refuses a phrase the source does not hold, one homed elsewhere and one dismissed", () => {
    expect(refusals(withPhrase(phrasePassage({ phrase: "missing" })))).toEqual([
      `'${WORDS}' holds no phrase 'missing'`,
    ]);
    expect(
      refusals(withPhrase(phrasePassage({ phrase: "elsewhere", text: ELSEWHERE.text }))),
    ).toEqual([
      `phrase 'elsewhere' of '${WORDS}' has no home at ${HOME}: its where names corpus/skills/other-skill/method.md`,
    ]);
    expect(refusals(withPhrase(phrasePassage({ phrase: "dismissed", text: "Be bold." })))).toEqual([
      `phrase 'dismissed' of '${WORDS}' is dismissed, so no passage takes it`,
    ]);
  });

  it("refuses a written passage crediting a words source with no phrase, and a taken passage from one", () => {
    const { phrase: _phrase, ...plain } = phrasePassage();
    expect(refusals(withPhrase(plain))).toEqual([
      `a written passage of 'SKILL.md' credits the words source '${WORDS}' and names no phrase: a words source is credited by a phrase passage alone`,
    ]);
    expect(
      refusals(
        withPhrase({
          passage: "taken",
          source: WORDS,
          file: "phrases.md",
          segments: ["0123456789ab"],
        }),
      ),
    ).toEqual([
      `'${WORDS}' is a words source: a phrase passage credits it, and nothing is taken, copied or dropped from it`,
    ]);
  });

  it("refuses a phrase passage crediting a pinned source, and a words source the manifest does not hold", () => {
    const pinned = withPhrase(phrasePassage({ credits: ["fixture-upstream"] }));
    pinned.sources.pop();
    expect(refusals(pinned)).toEqual([
      "phrase passage of 'SKILL.md' credits 'fixture-upstream', which is no words source",
    ]);
    expect(refusals(withPhrase(), fixtureSnapshots)).toEqual([
      `the manifest pins no source '${WORDS}'`,
    ]);
  });

  it("leaves a words source out of the measure: a phrase has no snapshot to retain", () => {
    const parsed = parseRecipe(JSON.stringify(withPhrase()), "fixture.json");
    if (parsed._tag === "err") throw parsed.error;
    const checked = checkRecipe(parsed.value, snapshots);
    if (checked._tag === "err") throw checked.error;
    expect(checked.value.words).toEqual([WORDS]);
    const measured = measureRecipe(checked.value);
    expect(measured._tag === "ok" && measured.value.sources.map((s) => s.source)).toEqual([
      "fixture-upstream",
    ]);
  });
});

describe("J-194 S1 each home that names a recipe holds its phrase", () => {
  const made: string[] = [];
  afterEach(() => {
    for (const directory of made.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  /** The fixture corpus on disk, recorded, with a words source of the phrases given and its views written. */
  function corpusWith(phrasesOf: readonly WordsPhrase[]): string {
    const root = mkdtempSync(join(tmpdir(), "greenline-phrases-"));
    made.push(root);
    const corpus = join(root, "corpus");
    writeFixtureCorpus(corpus, { skillDirectory: true, recorded: true });
    const path = join(corpus, "manifest.json");
    // SAFETY: the fixture manifest written above holds a sources list; the verbs below parse the result.
    const manifest = JSON.parse(readFileSync(path, "utf8")) as { sources: object[] };
    manifest.sources.push({
      name: WORDS,
      kind: "words",
      author: "the operator",
      phrases: phrasesOf,
    });
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    expect(viewsVerb(corpus, true).failed).toBe(false);
    return corpus;
  }

  it("passes a phrase homed outside a recipe and a dismissed one", () => {
    const corpus = corpusWith([
      {
        id: "native-way",
        text: "Is there a native way?",
        date: "2026-11-07",
        where: ["src/shell/cli/event.ts"],
      },
      DISMISSED,
    ]);
    const verified = verifyVerb(corpus, []);
    expect(verified.output.refused).toEqual([]);
    expect(verified.failed).toBe(false);
  });

  it("refuses a home on a recipe's page no phrase passage of it takes, and a home under the skills naming no recipe", () => {
    const corpus = corpusWith([
      {
        id: "breaking-test",
        text: PHRASE,
        date: "2026-11-07",
        where: [HOME, "corpus/skills/no-such/SKILL.md"],
      },
    ]);
    const verified = verifyVerb(corpus, []);
    expect(verified.output.refused).toEqual([
      {
        skill: WORDS,
        issues: [
          {
            message: `phrase 'breaking-test' names its home ${HOME}, and no phrase passage of 'fixture-skill' takes it on SKILL.md`,
          },
          {
            message:
              "phrase 'breaking-test' names its home corpus/skills/no-such/SKILL.md, and no recipe 'no-such' stands",
          },
        ],
      },
    ]);
    expect(verified.failed).toBe(true);
    expect(verifyVerb(corpus, ["fixture-skill"]).output.refused).toEqual([]);
  });
});
