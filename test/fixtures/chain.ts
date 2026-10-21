/** The chain fixture (`workshop/components/ledger.md`, "The entry"): four entries over the recipe fixture, in the entry's form `greenline.entry/v2`, their canonical bytes, and the views they render to. */
import { createHash } from "node:crypto";
import type { OldChainTip, RulingItem } from "../../src/corpus/chain.ts";
import { COMMIT, CREDITED, fixtureRecipe, REPOSITORY, RENDERED_FILES, SOURCE } from "./recipe.ts";

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/** The old chain's tip the first entry cites. */
export const OLD_TIP: OldChainTip["oldChain"] = {
  id: "old-tip-2026-09-28",
  revision: "d".repeat(64),
  commit: "e".repeat(40),
};

/** The sha256 of the fixture recipe's file, as the recipe fixture writes it. */
export const RECIPE_DIGEST: string = sha256(`${JSON.stringify(fixtureRecipe(), null, 2)}\n`);

/** The sha256 of the fixture skill directory: one line per file, its digest and its path, in path order. */
export const RESULT_DIGEST: string = sha256(
  [...RENDERED_FILES]
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([path, text]) => `${sha256(text)}  ${path}\n`)
    .join(""),
);

/** The fixture recipe's measure as a change entry records it. */
const FIXTURE_MEASURE = {
  stub: false,
  sources: [
    {
      source: SOURCE,
      segments: 12,
      taken: 11,
      exact: 10,
      retention: 10 / 11,
      coverage: 11 / 12,
      meetsMinimum: true,
      creditLine: false,
    },
  ],
  growth: 7,
};

/**
 * The fixture's modes definition, which `record` reads at
 * `corpus/runtime/modes.json` to check a placement: the three kinds, with
 * when-sentences of the fixture's own, and two steps and two modes whose
 * names are none of the corpus's, so a placement is checked against the
 * definition loaded and never against a literal.
 */
export const FIXTURE_MODES: string = `${JSON.stringify(
  {
    schemaVersion: 5,
    kinds: [
      {
        name: "step",
        mechanism: "reach",
        record: "section",
        place: "ordered",
        budget: "counts",
        when: "A fixture step runs where the fixture mode reaches it.",
      },
      {
        name: "start",
        mechanism: "open",
        record: "section",
        place: "beside",
        budget: "free",
        when: "A fixture start is chosen when a fixture request begins.",
      },
      {
        name: "habit",
        mechanism: "arise",
        record: "none",
        place: "beside",
        budget: "free",
        when: "A fixture habit loads when its situation arises.",
      },
    ],
    steps: [
      { name: "outline", whenSplit: "plan", fixPass: false },
      { name: "check", whenSplit: "both", fixPass: true },
    ],
    modes: [
      {
        name: "quick",
        promise: "a quick fixture change",
        typicalRequest: "a one-line fixture fix",
        fixRounds: 0,
        budget: { words: 1000 },
        steps: { outline: { depth: "none" }, check: { depth: "inline" } },
      },
      {
        name: "careful",
        promise: "a careful fixture change",
        typicalRequest: "a fixture change with a contract",
        fixRounds: 1,
        budget: { words: 2000 },
        steps: { outline: { depth: "written" }, check: { depth: "independent", agents: 1 } },
      },
    ],
    floors: [],
  },
  null,
  2,
)}\n`;

/**
 * The placement the fixture's copy carries, in the entry's field order: a
 * step method on the slot of the fixture skill, which serves the check
 * step; it strengthens that skill, inline at quick and by a fresh agent at
 * careful, as a trial.
 * @returns a fresh copy a test may change
 */
export function fixturePlacement(): FixturePlacement {
  return {
    kind: "step",
    slot: "fixture-skill",
    catches: "A fixture change whose check cannot fail.",
    evidence: "witnessed",
    move: "strengthen",
    boldest: {
      move: "add",
      needs: "A with-and-without run that measures the catch at both modes.",
    },
    modes: [
      { mode: "quick", step: "check", depth: "inline", cost: 40 },
      { mode: "careful", step: "check", depth: "independent", cost: 120 },
    ],
    ships: "trial",
  };
}

/** A JSON object a fixture holds, open to a test's changes. */
export type FixtureObject = { [field: string]: FixtureValue };

/** A placement as its entry states it, its rows reachable as objects; open to a test's changes. */
export type FixturePlacement = FixtureObject & { modes: FixtureObject[] };

/** An entry as its file states it, without its predecessor; open to a test's changes. */
export type FixtureEntry = { schema: string; id: string; kind: string } & {
  [field: string]: FixtureValue;
};

/** A JSON value an entry fixture holds. */
export type FixtureValue =
  | string
  | number
  | boolean
  | null
  | FixtureValue[]
  | { [field: string]: FixtureValue };

/** The entry's schema identifier, `greenline.entry/v2`. */
export const ENTRY_SCHEMA = "greenline.entry/v2";

/** The stub's ruling item, the one the fixture chain's rulings hold. */
export const STUB_RULING: RulingItem = {
  date: "2026-10-06",
  words: "Tiny only delegates, so it is a stub",
};

/**
 * The four fixture entries, oldest first, without predecessors: a pinned
 * source copied with its placement, the fixture skill's change, a stub's
 * change with its ruling, and an unpinned source declined; each with its
 * gist, its reason and its ruling list.
 * @returns fresh copies a test may change
 */
export function fixtureEntries(): FixtureEntry[] {
  return [
    {
      schema: ENTRY_SCHEMA,
      id: "2026-10-04-fixture-upstream-read",
      kind: "source",
      source: { repository: REPOSITORY, commit: COMMIT, path: "fixture" },
      pin: SOURCE,
      licence: "mit",
      verdict: "copy",
      gist: "The fixture method is taken whole",
      reason: "The fixture method is taken whole, sentence by sentence.",
      authorisedBy: null,
      ruling: [],
      placement: fixturePlacement(),
    },
    {
      schema: ENTRY_SCHEMA,
      id: "2026-10-05-fixture-skill-recipe",
      kind: "change",
      subject: "skill:fixture-skill",
      recipe: RECIPE_DIGEST,
      result: RESULT_DIGEST,
      pages: [{ path: "SKILL.md" }, { path: "notes.md" }, { path: "scripts/run.sh" }],
      gist: "The fixture skill moves to its recipe",
      reason: "The fixture skill moves to its recipe, byte for byte.",
      authorisedBy: null,
      ruling: [],
      measure: structuredClone(FIXTURE_MEASURE),
    },
    {
      schema: ENTRY_SCHEMA,
      id: "2026-10-06-tiny-skill-stub",
      kind: "change",
      subject: "skill:tiny-skill",
      recipe: "1".repeat(64),
      result: "2".repeat(64),
      pages: [{ path: "SKILL.md" }],
      gist: "The tiny skill is written here, crediting its source",
      reason: "The tiny skill is written here and credits its source.",
      authorisedBy: { ...STUB_RULING },
      ruling: [{ ...STUB_RULING }],
      measure: { stub: true, sources: [], growth: 9 },
    },
    {
      schema: ENTRY_SCHEMA,
      id: "2026-10-07-other-read",
      kind: "source",
      source: { repository: "https://example.com/other", commit: "b".repeat(40), path: "." },
      licence: "ideas-only",
      verdict: "decline",
      gist: "It restates the fixture method",
      reason: "It restates the fixture method and adds nothing to it.",
      authorisedBy: null,
      ruling: [],
    },
  ];
}

/**
 * The retirement of the fixture skill after its change, without its
 * predecessor: the skill, the slice that retires it, the skill that takes
 * its place and the digest of the recipe it leaves, which is the one its
 * latest change entry records.
 * @returns a fresh copy a test may change
 */
export function fixtureRetirement(): FixtureEntry {
  return {
    schema: ENTRY_SCHEMA,
    id: "2026-10-08-fixture-skill-retired",
    kind: "retirement",
    skill: "fixture-skill",
    slice: "S13 of the fixture plan",
    replacedBy: "fixture-heir",
    recipe: RECIPE_DIGEST,
    gist: "The fixture heir takes the fixture skill's place",
    reason: "The fixture heir takes the fixture skill's place, as the fixture ruling says.",
    authorisedBy: { date: "2026-10-08", words: "The fixture ruling, the heir takes its place" },
    ruling: [{ date: "2026-10-08", words: "The fixture ruling, the heir takes its place" }],
  };
}

/** The fields of each kind in the entry's order, after `schema`, `id`, `kind` and `previous` (`workshop/components/ledger.md`, "The entry"). */
const FIELD_ORDER = {
  change: [
    "subject",
    "recipe",
    "result",
    "pages",
    "gist",
    "reason",
    "authorisedBy",
    "ruling",
    "measure",
  ],
  source: [
    "source",
    "pin",
    "licence",
    "verdict",
    "gist",
    "reason",
    "authorisedBy",
    "ruling",
    "handoff",
    "placement",
  ],
  retirement: [
    "skill",
    "slice",
    "replacedBy",
    "recipe",
    "gist",
    "reason",
    "authorisedBy",
    "ruling",
  ],
} as const satisfies Record<string, readonly string[]>;

/** The fields of a kind in the entry's order; none for a kind outside the three. */
function fieldOrder(kind: string): readonly string[] {
  return kind === "change" || kind === "source" || kind === "retirement" ? FIELD_ORDER[kind] : [];
}

/**
 * An entry's canonical bytes, its predecessor placed after `kind` as
 * `record` writes it and its fields in the entry's order, so a test may add
 * a field anywhere; a field the order does not name follows them.
 * @param entry the entry without its predecessor
 * @param previous its predecessor
 * @returns the text of its file
 */
export function entryText(entry: FixtureEntry, previous: FixtureValue): string {
  const { schema, id, kind, ...rest } = entry;
  const order = fieldOrder(kind);
  const named = Object.fromEntries(
    order.filter((field) => rest[field] !== undefined).map((field) => [field, rest[field]]),
  );
  const others = Object.fromEntries(
    Object.entries(rest).filter(([field]) => !order.includes(field)),
  );
  return `${JSON.stringify({ schema, id, kind, previous, ...named, ...others }, null, 2)}\n`;
}

/**
 * Chain entries in order: the first cites the old tip, each later one its predecessor's digest.
 * @param entries the entries, oldest first
 * @returns each entry's file name and text
 */
export function chainTexts(
  entries: readonly FixtureEntry[],
): { readonly name: string; readonly text: string }[] {
  const texts: { readonly name: string; readonly text: string }[] = [];
  let previous: FixtureValue = { oldChain: { ...OLD_TIP } };
  for (const entry of entries) {
    const text = entryText(entry, previous);
    texts.push({ name: `${entry.id}.json`, text });
    previous = { id: entry.id, sha256: sha256(text) };
  }
  return texts;
}

/** The sources the stub's recipe lists. */
export const STUB_SOURCES: readonly string[] = [CREDITED];

/** The index the four entries render to, written out by hand. */
export const EXPECTED_INDEX: string = `# The ledger

Generated by \`node scripts/corpus.mjs views\` from the entries under \`corpus/ledger/entries/\`, and never edited by hand. Each entry names its predecessor by the digest of its bytes, and the first cites the old chain's tip. The entries are listed newest first.

## How to read an entry

Every entry opens with what it records and its reason, then:

- Gist: the reason in at most twelve words.
- Authorised by: the one ruling that authorised the entry, shown first, with its date and the operator's words. It reads \`no ruling of its own\` when the entry adds none, and \`not recorded\` on an entry recorded before the ledger kept this field with several rulings of its own.
- Rulings: every ruling the entry carries, each with its date and the operator's words. A change's list is cumulative: it restates the rulings of its subject's earlier changes and appends its own.

A change entry records one change to a skill, the modes or the block. It also shows:

- Pages: the installed pages the change touched, each by its path inside the skill's directory, or in the workspace for the modes or the block. It reads \`unknown\` on an entry recorded before the ledger kept this field whose record does not show them.
- The measure table, one row per source the skill takes from. It measures the whole skill as the change leaves it, not the change alone.
  - Source: the pinned source.
  - Segments: the sentences and list items of the source's files the skill's recipe names.
  - Taken: the segments the skill takes.
  - Exact: the taken segments the skill keeps unedited and in the source's order.
  - Retention: exact over taken. A retention under the 90% minimum is marked in its row, and the operator's ruling allows it.
  - Coverage: taken over segments.
  - Credit line: \`yes\` when the skill takes no segment exactly, so the source is credited rather than measured.
- Written words, the whole skill's: the words the skill's recipe writes itself, beyond what it takes from its sources, across the whole skill. It is not the size of the change.

A source entry records one source read from a repository at a commit: its repository, commit and path, its licence, its verdict and its reason. It may also show:

- Handed to: the owner a part of the source is handed to, garden or a workshop craft, then each part and where it stands in the source.
- Its placement, for a source whose method enters a skill: its kind, its move and the slot it names, whether it ships as a \`trial\` a workspace enables or as a \`default\`, the evidence for it, what it catches, and the boldest move considered with what that move needs. Then one row per mode:

- Mode: the mode the row places the method at.
- Step: the step of the line where the method runs or loads at that mode.
- Depth: that step's depth at that mode.
- Cost in words: the words an agent reads at that mode that the placement adds there; below zero for the words a swap removes.
- It loads: the reference files the method reads, each inside the skill's directory, and the depth at which it reads them.

A retirement entry records a skill leaving the roster: the slice that retires it, the skill that takes its place and the recipe it leaves.

## 2026-10-07-other-read

A source read: https://example.com/other at \`bbbbbbbbbbbb\`, path \`.\`. Licence \`ideas-only\`, verdict \`decline\`: It restates the fixture method and adds nothing to it.

Gist: It restates the fixture method

Authorised by: no ruling of its own.

No ruling is recorded.

## 2026-10-06-tiny-skill-stub

A change to the skill \`tiny-skill\`: The tiny skill is written here and credits its source.

Pages: \`SKILL.md\`.

Gist: The tiny skill is written here, crediting its source

The skill is a stub: its sources are credited, not measured.

Written words, the whole skill's: 9.

Authorised by: 2026-10-06: Tiny only delegates, so it is a stub

Rulings, cumulative:

- 2026-10-06: Tiny only delegates, so it is a stub

## 2026-10-05-fixture-skill-recipe

A change to the skill \`fixture-skill\`: The fixture skill moves to its recipe, byte for byte.

Pages: \`SKILL.md\`, \`notes.md\`, \`scripts/run.sh\`.

Gist: The fixture skill moves to its recipe

| Source             | Segments | Taken | Exact | Retention | Coverage | Credit line |
| ------------------ | -------- | ----- | ----- | --------- | -------- | ----------- |
| \`fixture-upstream\` | 12       | 11    | 10    | 90.9%     | 91.7%    | no          |

Written words, the whole skill's: 7.

Authorised by: no ruling of its own.

No ruling is recorded.

## 2026-10-04-fixture-upstream-read

It continues the old chain from its tip \`old-tip-2026-09-28\` (revision \`dddddddddddd\`), whose file the commit \`eeeeeeeeeeee\` last wrote.

A source read: https://example.com/fixture-upstream at \`aaaaaaaaaaaa\`, path \`fixture\`, pinned as \`fixture-upstream\`. Licence \`mit\`, verdict \`copy\`: The fixture method is taken whole, sentence by sentence.

Gist: The fixture method is taken whole

Authorised by: no ruling of its own.

No ruling is recorded.

A \`step\` by \`strengthen\` of \`fixture-skill\`, placed as a \`trial\` on \`witnessed\` evidence. It catches: A fixture change whose check cannot fail. The boldest option, \`add\`, needs: A with-and-without run that measures the catch at both modes.

| Mode      | Step    | Depth         | Cost in words |
| --------- | ------- | ------------- | ------------- |
| \`quick\`   | \`check\` | \`inline\`      | 40            |
| \`careful\` | \`check\` | \`independent\` | 120           |
`;

/** The sources register the four entries render to, without frozen rows. */
export const EXPECTED_REGISTER: string = `# Sources

Generated by \`node scripts/corpus.mjs views\` from the entries under \`corpus/ledger/entries/\` and the recipes, and never edited by hand. It lists every source read from a repository at a commit, as its source entry records it; then each tracked source with the skills that take its text, their retention (the taken segments kept unedited and in the source's order, over those taken, marked in its row under the 90% minimum) and their coverage (the segments taken, over those the recipe names); then the credit lines, the sources a skill takes no text of exactly (the ruling C14); then the skills retired, each with the skill that takes its place.

## Sources read

| Source                                                            | Licence      | Verdict   | Placement                                                                                                                                                               | Reason                                                   | Entry                              |
| ----------------------------------------------------------------- | ------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------- |
| https://example.com/fixture-upstream at \`aaaaaaaaaaaa\`, \`fixture\` | \`mit\`        | \`copy\`    | A fixture change whose check cannot fail. A step by \`strengthen\` of \`fixture-skill\`, placed at \`quick\` (\`check\`, inline) and \`careful\` (\`check\`, independent), a trial. | The fixture method is taken whole, sentence by sentence. | \`2026-10-04-fixture-upstream-read\` |
| https://example.com/other at \`bbbbbbbbbbbb\`, \`.\`                  | \`ideas-only\` | \`decline\` | none                                                                                                                                                                    | It restates the fixture method and adds nothing to it.   | \`2026-10-07-other-read\`            |

## Tracked sources

| Source             | Repository and commit                                  | Skill           | Retention | Coverage |
| ------------------ | ------------------------------------------------------ | --------------- | --------- | -------- |
| \`fixture-upstream\` | https://example.com/fixture-upstream at \`aaaaaaaaaaaa\` | \`fixture-skill\` | 90.9%     | 91.7%    |

## Credit lines

| Source             | Repository and commit                                  | Skill        |
| ------------------ | ------------------------------------------------------ | ------------ |
| \`fixture-credited\` | https://example.com/fixture-credited at \`cccccccccccc\` | \`tiny-skill\` |

## Retired skills

None yet.
`;

/** The third-party notices the four entries render to. */
export const EXPECTED_NOTICES: string = `# Third-party notices for greenline

These notices cover the skills greenline distributes that take text from, or credit, a source outside greenline. greenline is independent and implies no endorsement by any source author; its own license does not replace the terms below. This file is generated by the corpus instrument's \`views\` verb from the ledger's entries, the recipes and the manifest, and never edited by hand.

## Sources

| Source             | Repository and commit                                                                                  | Terms and attribution                   | Skills                        |
| ------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------- | ----------------------------- |
| \`fixture-upstream\` | [fixture-upstream](https://example.com/fixture-upstream) at \`aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\` | MIT; Copyright (c) 2026 Fixture Author  | \`fixture-skill\`               |
| \`fixture-credited\` | [fixture-credited](https://example.com/fixture-credited) at \`cccccccccccccccccccccccccccccccccccccccc\` | MIT; Copyright (c) 2026 Credited Author | \`tiny-skill\` (extra) (credit) |

A skill marked (credit) takes no text of its source exactly; the source is credited for what it lent. A skill marked (extra) installs only when a workspace asks for it. Every difference a skill makes from its source's text is recorded with its reason in the skill's recipe, and every change to it is an entry of the ledger. Source rights travel with these skills; preserve this notice with copied skills.

## Credits within optional assets

The \`tiny-skill\` (extra) icon catalog credits the Fixture Icons (MIT).

## MIT License

The following text applies to every source above.

Permission is hereby granted, free of charge, to use the fixture.

THE FIXTURE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
`;

/** The corpus notice the four entries render to. */
export const EXPECTED_CORPUS_NOTICE: string = `# Corpus sources

Generated by \`node scripts/corpus.mjs views\`, and never edited by hand. It lists each source a recipe takes from or credits, with its frozen snapshot and its terms. The complete notices, with the licence text, are \`THIRD_PARTY_NOTICES.md\` at the repository root, which travels with the package and the installed skills.

| Source             | Snapshot                                                                     | Terms                                   |
| ------------------ | ---------------------------------------------------------------------------- | --------------------------------------- |
| \`fixture-upstream\` | \`corpus/upstream/fixture-upstream/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/\` | MIT; Copyright (c) 2026 Fixture Author  |
| \`fixture-credited\` | \`corpus/upstream/fixture-credited/cccccccccccccccccccccccccccccccccccccccc/\` | MIT; Copyright (c) 2026 Credited Author |

A snapshot is immutable. A skill under \`corpus/skills/\` is rendered from its recipe and these snapshots and verified byte for byte by \`node scripts/corpus.mjs verify\`.
`;

/** The line view the four entries render to, over the fixture's modes definition and its two skills. */
export const EXPECTED_LINE: string = `# The line

Generated by \`node scripts/corpus.mjs views\` from the modes definition \`corpus/runtime/modes.json\`, the manifest's skills and the entries under \`corpus/ledger/entries/\` (the source entries and each skill's latest change entry), and never edited by hand. The line is the ordered steps a mode runs. A slot is a position on it that one skill serves: a step, a start or a habit. A slot's stack is the roster skills on it and the candidates whose placement names it, each with its source's latest verdict; a decline or a hand-off takes a candidate off its stack, and a hold keeps it there.

A source whose latest verdict is a copy, a combine or a lift, on a row a roster skill stands on, has entered that skill and is listed under Absorbed; any other is a pending candidate, listed under Candidates: one a hold keeps, and one whose slot no skill holds yet. A slot that more than one default skill serves is marked for the re-cut, which leaves one skill per slot. A slot whose pending candidates share a catch is marked as a combine candidate. A slot that a candidate's add names and nothing holds yet is marked as proposed. A candidate whose placement names a retired skill stands on the row of the skill that took its place.

## The steps

| Slot      | quick  | careful              | Default skills  | Trials | Absorbed                                                                                     | Candidates | Marks |
| --------- | ------ | -------------------- | --------------- | ------ | -------------------------------------------------------------------------------------------- | ---------- | ----- |
| \`outline\` | none   | written              | none            | none   | none                                                                                         | none       |       |
| \`check\`   | inline | independent, 1 agent | \`fixture-skill\` | none   | \`fixture-upstream/fixture\` (\`copy\`, \`strengthen\`): A fixture change whose check cannot fail. | none       |       |

## The starts

None yet.

## The habits

| Slot         | Default skills       | Trials | Absorbed | Candidates | Marks |
| ------------ | -------------------- | ------ | -------- | ---------- | ----- |
| \`tiny-skill\` | \`tiny-skill\` (extra) | none   | none     | none       |       |

## The pages

Each roster skill's latest change and the installed pages it touched, by their path inside the skill's directory. \`unknown\` marks a change recorded before its entry named its pages; the index lists every change with its pages.

| Skill           | Latest change                     | Pages it touched                         |
| --------------- | --------------------------------- | ---------------------------------------- |
| \`fixture-skill\` | \`2026-10-05-fixture-skill-recipe\` | \`SKILL.md\`, \`notes.md\`, \`scripts/run.sh\` |
| \`tiny-skill\`    | \`2026-10-06-tiny-skill-stub\`      | \`SKILL.md\`                               |
`;
