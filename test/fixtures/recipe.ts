/** The recipe fixture (`workshop/components/recipes.md`): one pinned source, its frozen snapshot, a recipe and the skill directory it renders to. */
import type { Snapshots } from "../../src/corpus/recipe.ts";

/** The fixture source's upstream skill: nine segments, over the stub trigger. */
export const UPSTREAM_SKILL = `---
name: fixture
description: An upstream skill the recipe tests take from.
---

# Fixture method

Read the request before you touch the code, and say back what you heard in one sentence. Then write the smallest test that fails for the reason you expect, e.g. a missing branch. Run it and watch it fail before you write any code at all.

- Keep each test small enough that its name states the one behavior it proves.
- Prefer a real seam, such as a file system in a temporary directory, over a mock of your own module.
- Delete a test that cannot fail for a reason you can name.

This sentence is one the recipe drops. When the test passes, refactor the code and the test together, and run the whole suite again before you report anything to the person who asked.
`;

/** The fixture source's support page: three segments. */
export const UPSTREAM_NOTES = `# Notes

A note the skill carries beside its method. It is taken whole.
`;

/** A tiny upstream skill, under the stub trigger. */
export const TINY_SKILL = `---
name: tiny
description: A tiny upstream skill.
---

# Tiny

Use the other skill for this.
`;

/** The fixture source's script, copied whole. */
export const UPSTREAM_SCRIPT = "#!/bin/sh\necho fixture\n";

/** The fixture source's licence file, whose copyright line the notices print. */
export const UPSTREAM_LICENCE = `MIT License

Copyright (c) 2026 Fixture Author

Permission is hereby granted, free of charge, to use the fixture.

THE FIXTURE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
`;

/** The fixture source's name and pin. */
export const SOURCE = "fixture-upstream";
/** The fixture source's repository, as the manifest pins it. */
export const REPOSITORY = "https://example.com/fixture-upstream";
/** The fixture source's commit, as the manifest pins it. */
export const COMMIT: string = "a".repeat(40);
const SNAPSHOT = `upstream/${SOURCE}/${COMMIT}`;

/** A second pinned source, without a licence file: the manifest states its holder. */
export const CREDITED = "fixture-credited";
const CREDITED_COMMIT = "c".repeat(40);
const CREDITED_SNAPSHOT = `upstream/${CREDITED}/${CREDITED_COMMIT}`;

/** The snapshot's files, by path inside it. */
const SNAPSHOT_FILES: ReadonlyMap<string, string> = new Map([
  ["fixture/SKILL.md", UPSTREAM_SKILL],
  ["fixture/notes.md", UPSTREAM_NOTES],
  ["fixture/run.sh", UPSTREAM_SCRIPT],
  ["tiny/SKILL.md", TINY_SKILL],
  ["LICENSE", UPSTREAM_LICENCE],
]);

/** The second source's snapshot: a tiny upstream skill a stub credits. */
const CREDITED_FILES: ReadonlyMap<string, string> = new Map([["tiny/SKILL.md", TINY_SKILL]]);

/** The segment ids of `fixture/SKILL.md`, in order, each the sha256 prefix of its content. */
export const SKILL_IDS = [
  "c698f9a8efd8", // # Fixture method
  "5f94cec37a5e", // Read the request ...
  "e74951160960", // Then write the smallest test ...
  "1cc2033122f2", // Run it and watch it fail ...
  "81e5356af6fe", // Keep each test small ...
  "1f5b9e032fee", // Prefer a real seam ...
  "9476dea55b40", // Delete a test ...
  "a8c253d5f156", // This sentence is one the recipe drops.
  "a6b2ac6fb295", // When the test passes ...
] as const;

/** The segment ids of `fixture/notes.md`, in order. */
export const NOTES_IDS = ["360aa5ebfa18", "a1688cfbdb9a", "cf058237d365"] as const;

/** The segment ids of `tiny/SKILL.md`, in order. */
export const TINY_IDS = ["ffbba9aee914", "9932c1e311a0"] as const;

/** An edit as a recipe file states it. */
export interface FixtureEdit {
  segment: string;
  find: string;
  replace: string;
  kind: string;
  reason: string;
  ruling?: string;
}

/** A passage as a recipe file states it. */
export type FixturePassage =
  | {
      passage: "taken";
      source: string;
      file: string;
      segments: string[];
      edits?: FixtureEdit[];
      join?: string;
    }
  | {
      passage: "written";
      text: string;
      kind: string;
      reason: string;
      ruling?: string;
      credits?: string[];
      join?: string;
    };

/** A drop as a recipe file states it. */
export interface FixtureDrop {
  source: string;
  file: string;
  segment: string;
  kind: string;
  reason: string;
  ruling?: string;
  replacedBy?: { path: string; passage: number };
}

/** A copy as a recipe file states it: from a source's snapshot, or authored and held by its digest. */
export interface FixtureCopy {
  path: string;
  source?: string;
  file?: string;
  sha256?: string;
  kind?: string;
  reason?: string;
  ruling?: string;
}

/** A recipe as its file states it, open to a test's changes. */
export interface FixtureRecipe {
  schema: string;
  name: string;
  frontMatter: { field: string; value: string }[];
  sources: string[];
  files: { path: string; passages: FixturePassage[]; ending?: string }[];
  copies: FixtureCopy[];
  drops: FixtureDrop[];
  credit?: { source: string; file: string; ruling: string };
  notStub?: { source: string; file: string; ruling: string }[];
}

/** The written passage the fixture joins to the paragraph before it. */
export const WRITTEN = "Greenline adds this sentence to the paragraph.";

/**
 * The fixture recipe: one taken source, one edit, one drop, one written
 * passage joined without a blank line, a second prose file and one copy.
 * @returns a fresh copy a test may change
 */
export function fixtureRecipe(): FixtureRecipe {
  return {
    schema: "greenline.recipe/v1",
    name: "fixture-skill",
    frontMatter: [
      { field: "name", value: "fixture-skill" },
      { field: "description", value: 'A recipe fixture: one taken source, one "edit", one drop.' },
    ],
    sources: [SOURCE],
    files: [
      {
        path: "SKILL.md",
        passages: [
          {
            passage: "taken",
            source: SOURCE,
            file: "fixture/SKILL.md",
            segments: [SKILL_IDS[0], SKILL_IDS[1], SKILL_IDS[2], SKILL_IDS[3]],
            edits: [
              {
                segment: SKILL_IDS[1],
                find: "say back what you heard",
                replace: "restate what you heard",
                kind: "name",
                reason: "the house word for repeating a request",
              },
            ],
          },
          {
            passage: "written",
            text: WRITTEN,
            kind: "home",
            reason: "the fixture's own line",
            join: " ",
          },
          {
            passage: "taken",
            source: SOURCE,
            file: "fixture/SKILL.md",
            segments: [SKILL_IDS[4], SKILL_IDS[5], SKILL_IDS[6]],
          },
          {
            passage: "taken",
            source: SOURCE,
            file: "fixture/SKILL.md",
            segments: [SKILL_IDS[8]],
          },
        ],
      },
      {
        path: "notes.md",
        passages: [
          {
            passage: "taken",
            source: SOURCE,
            file: "fixture/notes.md",
            segments: [...NOTES_IDS],
          },
        ],
      },
    ],
    copies: [{ path: "scripts/run.sh", source: SOURCE, file: "fixture/run.sh" }],
    drops: [
      {
        source: SOURCE,
        file: "fixture/SKILL.md",
        segment: SKILL_IDS[7],
        kind: "scope",
        reason: "it only announces the drop",
        replacedBy: { path: "SKILL.md", passage: 1 },
      },
    ],
  };
}

/** The `SKILL.md` the fixture recipe renders to, written out by hand. */
export const RENDERED_SKILL = `---
name: "fixture-skill"
description: "A recipe fixture: one taken source, one \\"edit\\", one drop."
---

# Fixture method

Read the request before you touch the code, and restate what you heard in one sentence. Then write the smallest test that fails for the reason you expect, e.g. a missing branch. Run it and watch it fail before you write any code at all. Greenline adds this sentence to the paragraph.

- Keep each test small enough that its name states the one behavior it proves.
- Prefer a real seam, such as a file system in a temporary directory, over a mock of your own module.
- Delete a test that cannot fail for a reason you can name.

When the test passes, refactor the code and the test together, and run the whole suite again before you report anything to the person who asked.
`;

/** The fixture skill directory, by path. */
export const RENDERED_FILES: ReadonlyMap<string, string> = new Map([
  ["SKILL.md", RENDERED_SKILL],
  ["notes.md", UPSTREAM_NOTES],
  ["scripts/run.sh", UPSTREAM_SCRIPT],
]);

const encoder = new TextEncoder();

/** The in-memory snapshots of the fixture source, as `checkRecipe` reads them. */
export const fixtureSnapshots: Snapshots = {
  sources: new Set([SOURCE, CREDITED]),
  text: (source, file) => snapshotOf(source)?.get(file),
  bytes: (source, file) => {
    const text = snapshotOf(source)?.get(file);
    return text === undefined ? undefined : encoder.encode(text);
  },
};

function snapshotOf(source: string): ReadonlyMap<string, string> | undefined {
  if (source === SOURCE) return SNAPSHOT_FILES;
  return source === CREDITED ? CREDITED_FILES : undefined;
}

/** The fixture's corpus manifest: the one pinned source and a roster of the fixture skill. */
const MANIFEST = {
  schemaVersion: 11,
  sources: [
    {
      name: SOURCE,
      repo: REPOSITORY,
      commit: COMMIT,
      snapshot: SNAPSHOT,
      license: "MIT",
    },
    {
      name: CREDITED,
      repo: "https://example.com/fixture-credited",
      commit: CREDITED_COMMIT,
      snapshot: CREDITED_SNAPSHOT,
      license: "MIT",
      holder: "Copyright (c) 2026 Credited Author",
    },
  ],
  skills: [{ name: "fixture-skill", kind: "step", slot: "check" }],
  intents: [{ intent: "the fixture", skills: ["fixture-skill"] }],
};

/**
 * The fixture's file tree under a corpus directory: the manifest, the
 * snapshot, the recipe and the committed skill directory.
 * @param recipe the recipe to write; the fixture's when omitted
 * @returns every file by its path under the corpus directory
 */
export function fixtureCorpus(
  recipe: FixtureRecipe = fixtureRecipe(),
): ReadonlyMap<string, string> {
  return new Map([
    ["manifest.json", `${JSON.stringify(MANIFEST, null, 2)}\n`],
    ...[...SNAPSHOT_FILES].map(([path, text]) => [`${SNAPSHOT}/${path}`, text] as const),
    ...[...CREDITED_FILES].map(([path, text]) => [`${CREDITED_SNAPSHOT}/${path}`, text] as const),
    [`recipes/${recipe.name}.json`, `${JSON.stringify(recipe, null, 2)}\n`],
    ...[...RENDERED_FILES].map(([path, text]) => [`skills/fixture-skill/${path}`, text] as const),
  ]);
}
