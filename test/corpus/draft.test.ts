/** The draft (`src/corpus/draft.ts`, `draft` in `src/corpus/instrument.ts`): a proposed recipe from a committed copy with every account left as the fill marker, and the fill-marker refusals of the other verbs. */
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJson } from "../../src/core/contract.ts";
import { draftNative, draftRecipe, recipeText } from "../../src/corpus/draft.ts";
import {
  draftVerb,
  measureVerb,
  recordVerb,
  renderVerb,
  verifyVerb,
} from "../../src/corpus/instrument.ts";
import {
  checkRecipe,
  parseRecipe,
  type Snapshots,
  type SourceName,
} from "../../src/corpus/recipe.ts";
import { compareSkill, renderSkill } from "../../src/corpus/render.ts";
import { readManifest, readSkillDirectory, readSnapshots } from "../../src/corpus/tree.ts";
import { chainTexts, fixtureEntries } from "../fixtures/chain.ts";
import { writeFixtureCorpus, writeTree } from "../fixtures/corpus-disk.ts";
import {
  COMMIT,
  fixtureCorpus,
  fixtureRecipe,
  fixtureSnapshots,
  NOTES_IDS,
  RENDERED_SKILL,
  SKILL_IDS,
  SOURCE,
  UPSTREAM_NOTES,
  UPSTREAM_SCRIPT,
  UPSTREAM_SKILL,
  WRITTEN,
} from "../fixtures/recipe.ts";

const encoder = new TextEncoder();
const made: string[] = [];

afterEach(() => {
  for (const directory of made.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function temporary(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  made.push(directory);
  return directory;
}

// SAFETY: the fixture's source name is a manifest source the fixture snapshots pin.
const source = SOURCE as SourceName;

/** A copy of the fixture snapshot with one edit, one insertion and one deletion, as the fixture recipe renders it, and one file copied whole. */
const COPY = [
  { path: "SKILL.md", bytes: encoder.encode(RENDERED_SKILL) },
  { path: "notes.md", bytes: encoder.encode(UPSTREAM_NOTES) },
  { path: "run.sh", bytes: encoder.encode(UPSTREAM_SCRIPT) },
];

function drafted(stub = false) {
  const result = draftRecipe({
    skill: "fixture-skill",
    source,
    upstream: "fixture",
    snapshots: fixtureSnapshots,
    copy: COPY,
    stub,
  });
  if (result._tag === "err") throw result.error;
  return result.value;
}

/** A recipe's file text as plain JSON, as a test compares it. */
function asFile(text: string) {
  return parseJson(text);
}

const todo = { kind: "<<fill>>", reason: "<<fill>>" };

describe("draftRecipe", () => {
  it("drafts the fixture's copy to the fixture recipe's passages, every account left as the fill marker", () => {
    const { recipe, todos } = drafted();
    expect(todos).toBe(3);
    expect(asFile(recipeText(recipe))).toEqual({
      schema: "greenline.recipe/v1",
      name: "fixture-skill",
      frontMatter: fixtureRecipe().frontMatter,
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
              edits: [{ segment: SKILL_IDS[1], find: "say back", replace: "restate", ...todo }],
            },
            { passage: "written", text: WRITTEN, ...todo, join: " " },
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
      copies: [{ path: "run.sh", source: SOURCE, file: "fixture/run.sh" }],
      drops: [{ source: SOURCE, file: "fixture/SKILL.md", segment: SKILL_IDS[7], ...todo }],
    });
  });

  it("proposes a recipe that renders the copy byte for byte", () => {
    const checked = checkRecipe(drafted().recipe, fixtureSnapshots);
    if (checked._tag === "err") throw checked.error;
    expect(compareSkill(renderSkill(checked.value), COPY)).toEqual([]);
  });

  it("proposes a stub: every passage written, the repeated drops credited and replaced, the credit's ruling the fill marker", () => {
    const { recipe } = drafted(true);
    expect(recipe.credit).toEqual({ source, file: "fixture/SKILL.md", ruling: "<<fill>>" });
    expect(
      recipe.files.flatMap((file) => file.passages).every((item) => item.passage === "written"),
    ).toBe(true);
    expect(recipe.drops).toHaveLength(12);
    expect(recipe.drops.find((drop) => drop.segment === SKILL_IDS[2])?.replacedBy).toEqual({
      path: "SKILL.md",
      passage: 0,
    });
    const checked = checkRecipe(recipe, fixtureSnapshots);
    if (checked._tag === "err") throw checked.error;
    expect(compareSkill(renderSkill(checked.value), COPY)).toEqual([]);
  });

  it("refuses a file that is not prose and that the snapshot holds at its path with other bytes", () => {
    const result = draftRecipe({
      skill: "fixture-skill",
      source,
      upstream: "fixture",
      snapshots: fixtureSnapshots,
      copy: [
        ...COPY.filter((file) => file.path !== "run.sh"),
        { path: "run.sh", bytes: encoder.encode("#!/bin/sh\necho changed\n") },
      ],
      stub: false,
    });
    expect(result._tag === "err" ? result.error.issues : []).toEqual([
      { message: `'run.sh' is not prose and not a copy of '${SOURCE}/fixture/run.sh'` },
    ]);
  });
});

describe("recipeText", () => {
  it("writes a list of strings on one line within the print width and open past it", () => {
    const recipe = drafted().recipe;
    const text = recipeText(recipe);
    expect(text).toContain(`  "sources": ["${SOURCE}"],\n`);
    expect(text).toContain(`          "segments": ["${SKILL_IDS[8]}"]\n`);
    const notes = recipe.files[1];
    const passage = notes?.passages[0];
    if (notes === undefined || passage?.passage !== "taken") throw new Error("notes.md is taken");
    const segments = recipe.files
      .flatMap((file) => file.passages)
      .flatMap((item) => (item.passage === "taken" ? item.segments : []));
    const long = recipeText({
      ...recipe,
      files: [notes, { path: "long.md", passages: [{ ...passage, segments }] }],
    });
    expect(long).toContain(`          "segments": [\n            "${SKILL_IDS[0]}",\n`);
  });

  it("writes a notStub ruling last, in the credit's place, and reads back as the recipe it printed", () => {
    const recipe = drafted().recipe;
    const ruled = {
      ...recipe,
      notStub: [{ source, file: "fixture/SKILL.md", ruling: "not a stub, the fixture's ruling" }],
    };
    const text = recipeText(ruled);
    expect(text).toMatch(
      /\n {2}\],\n {2}"notStub": \[\n {4}\{\n {6}"source": "fixture-upstream",\n {6}"file": "fixture\/SKILL.md",\n {6}"ruling": "not a stub, the fixture's ruling"\n {4}\}\n {2}\]\n\}\n$/,
    );
    expect(asFile(text)).toMatchObject({ notStub: ruled.notStub });
  });

  it("S1 writes an account's gist after its reason and before its ruling, and leaves it out where none is written", () => {
    const recipe = drafted().recipe;
    const drop = recipe.drops[0];
    if (drop === undefined) throw new Error("the fixture drops a segment");
    const gisted = {
      ...recipe,
      drops: [{ ...drop, kind: "method" as const, reason: "R", gist: "G", ruling: "W" }],
    };
    const text = recipeText(gisted);
    expect(text).toContain(`"reason": "R",\n      "gist": "G",\n      "ruling": "W"`);
    expect(asFile(text)).toMatchObject({ drops: [{ reason: "R", gist: "G", ruling: "W" }] });
    expect(recipeText(recipe)).not.toContain('"gist"');
  });
});

/** The fixture's corpus on disk as a copy: the skill copied from the fixture upstream, its directory, and no recipe. */
function copyCorpus(): string {
  const corpus = temporary("greenline-draft-");
  const files = new Map(fixtureCorpus());
  files.delete("recipes/fixture-skill.json");
  for (const path of [...files.keys()]) if (path.startsWith("skills/")) files.delete(path);
  const manifest = z
    .object({})
    .passthrough()
    .parse(parseJson(files.get("manifest.json") ?? ""));
  writeTree(
    corpus,
    new Map([
      ...files,
      [
        "manifest.json",
        `${JSON.stringify(
          {
            ...manifest,
            skills: [
              {
                name: "fixture-skill",
                kind: "step",
                slot: "check",
                upstream: { family: SOURCE, name: "fixture", path: "skills/fixture" },
              },
            ],
          },
          null,
          2,
        )}\n`,
      ],
      ["skills/fixture-skill/SKILL.md", RENDERED_SKILL],
      ["skills/fixture-skill/notes.md", UPSTREAM_NOTES],
      ["skills/fixture-skill/run.sh", UPSTREAM_SCRIPT],
    ]),
  );
  return corpus;
}

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/** Every file under the skill directory with its digest. */
function skillDigests(corpus: string): Record<string, string> {
  const root = join(corpus, "skills/fixture-skill");
  return Object.fromEntries(
    readdirSync(root).map((name) => [name, sha256(readFileSync(join(root, name), "utf8"))]),
  );
}

describe("the draft verb", () => {
  it("writes the proposal, never under corpus/skills/, and refuses to rewrite a recipe that exists", () => {
    const corpus = copyCorpus();
    const before = skillDigests(corpus);
    expect(draftVerb(corpus, "fixture-skill", "copy")).toEqual({
      output: {
        verb: "draft",
        skill: "fixture-skill",
        wrote: "corpus/recipes/fixture-skill.json",
        todos: 3,
        differences: [],
        refused: [],
      },
      failed: false,
    });
    const path = join(corpus, "recipes/fixture-skill.json");
    const written = readFileSync(path, "utf8");
    expect(written).toContain(`"kind": "<<fill>>",`);
    expect(draftVerb(corpus, "fixture-skill", "copy")).toEqual({
      output: {
        verb: "draft",
        skill: "fixture-skill",
        wrote: null,
        todos: 0,
        differences: [],
        refused: [
          {
            skill: "fixture-skill",
            issues: [
              {
                message:
                  "the recipe 'corpus/recipes/fixture-skill.json' exists, and draft never rewrites one",
              },
            ],
          },
        ],
      },
      failed: true,
    });
    expect(readFileSync(path, "utf8")).toBe(written);
    expect(skillDigests(corpus)).toEqual(before);
  });

  it("refuses a skill copied from no upstream", () => {
    const corpus = temporary("greenline-draft-");
    writeFixtureCorpus(corpus, { skillDirectory: true, recorded: false });
    rmSync(join(corpus, "recipes/fixture-skill.json"));
    expect(draftVerb(corpus, "fixture-skill", "copy").output.refused).toEqual([
      {
        skill: "fixture-skill",
        issues: [
          {
            message:
              "'fixture-skill' was copied from no upstream; draft --native proposes a native skill's recipe",
          },
        ],
      },
    ]);
  });
});

/** A source that is one file, as `ponytail`'s `.agents/rules/ponytail.md`: a rule file with no front matter. */
const RULE_FILE = UPSTREAM_SKILL.slice(UPSTREAM_SKILL.indexOf("# Fixture method"));

/** The upstream path the one-file source's manifest entry names. */
const RULE_PATH = ".agents/rules/rule.md";

/** A one-file rule under the stub trigger: eight words of body. */
const TINY_RULE = "# Tiny rule\n\nUse the other skill for this.\n";

/**
 * The fixture's corpus on disk as a copy of a source that is one file: the
 * manifest names the file's path, and the snapshot holds the file as the
 * upstream name's `SKILL.md`, the form a single-file upstream's snapshot
 * takes; the copy is `SKILL.md` alone.
 * @param rule the rule file's text
 * @param copy the committed `SKILL.md`
 * @returns the corpus directory
 */
function oneFileCorpus(rule = RULE_FILE, copy = RENDERED_SKILL): string {
  const corpus = copyCorpus();
  for (const path of ["skills/fixture-skill/notes.md", "skills/fixture-skill/run.sh"])
    rmSync(join(corpus, path));
  const manifestPath = join(corpus, "manifest.json");
  const manifest = z
    .object({})
    .passthrough()
    .parse(parseJson(readFileSync(manifestPath, "utf8")));
  writeTree(
    corpus,
    new Map([
      [
        "manifest.json",
        `${JSON.stringify(
          {
            ...manifest,
            skills: [
              {
                name: "fixture-skill",
                kind: "step",
                slot: "check",
                upstream: { family: SOURCE, name: "rule", path: RULE_PATH },
              },
            ],
          },
          null,
          2,
        )}\n`,
      ],
      [`upstream/${SOURCE}/${COMMIT}/rule/SKILL.md`, rule],
      ["skills/fixture-skill/SKILL.md", copy],
    ]),
  );
  return corpus;
}

describe("a source that is one file", () => {
  it("drafts the copy's SKILL.md from the rule file, its front matter written and every account left as the fill marker", () => {
    const corpus = oneFileCorpus();
    const before = skillDigests(corpus);
    expect(draftVerb(corpus, "fixture-skill", "copy").output).toEqual({
      verb: "draft",
      skill: "fixture-skill",
      wrote: "corpus/recipes/fixture-skill.json",
      todos: 3,
      differences: [],
      refused: [],
    });
    expect(skillDigests(corpus)).toEqual(before);
    const recipe = asFile(readFileSync(join(corpus, "recipes/fixture-skill.json"), "utf8"));
    expect(recipe).toEqual({
      schema: "greenline.recipe/v1",
      name: "fixture-skill",
      frontMatter: fixtureRecipe().frontMatter,
      sources: [SOURCE],
      files: [
        {
          path: "SKILL.md",
          passages: [
            {
              passage: "taken",
              source: SOURCE,
              file: "rule/SKILL.md",
              segments: [SKILL_IDS[0], SKILL_IDS[1], SKILL_IDS[2], SKILL_IDS[3]],
              edits: [{ segment: SKILL_IDS[1], find: "say back", replace: "restate", ...todo }],
            },
            { passage: "written", text: WRITTEN, ...todo, join: " " },
            {
              passage: "taken",
              source: SOURCE,
              file: "rule/SKILL.md",
              segments: [SKILL_IDS[4], SKILL_IDS[5], SKILL_IDS[6]],
            },
            {
              passage: "taken",
              source: SOURCE,
              file: "rule/SKILL.md",
              segments: [SKILL_IDS[8]],
            },
          ],
        },
      ],
      copies: [],
      drops: [{ source: SOURCE, file: "rule/SKILL.md", segment: SKILL_IDS[7], ...todo }],
    });
  });
  it("is read by the stub trigger like any other SKILL.md body, so a tiny rule trips it", () => {
    const frontMatter = RENDERED_SKILL.slice(0, RENDERED_SKILL.indexOf("# Fixture method"));
    const corpus = oneFileCorpus(TINY_RULE, frontMatter + TINY_RULE);
    expect(draftVerb(corpus, "fixture-skill", "copy").output.refused).toEqual([]);
    expect(measureVerb(corpus, ["fixture-skill"]).output.refused).toEqual([
      {
        skill: "fixture-skill",
        issues: [
          {
            message: `'${SOURCE}/rule/SKILL.md' has 8 words of body, under the stub trigger of 100: does it state a method of its own, with steps, an order or criteria, or does it only delegate to other skills or tools? The operator rules it: a stub's recipe carries the credit, and a recipe whose source the operator rules is not a stub names the body in notStub with that ruling.`,
          },
        ],
      },
    ]);
  });
});

describe("a fill marker left in a recipe", () => {
  /** The fixture corpus with its edit's reason left as the fill marker. */
  function markedCorpus(): string {
    const corpus = temporary("greenline-fill-");
    writeFixtureCorpus(corpus, { skillDirectory: true, recorded: false });
    const recipe = fixtureRecipe();
    const first = recipe.files[0]?.passages[0];
    if (first?.passage !== "taken" || first.edits?.[0] === undefined)
      throw new Error("the fixture's first passage carries an edit");
    first.edits[0].reason = "<<fill>>";
    writeFileSync(
      join(corpus, "recipes/fixture-skill.json"),
      `${JSON.stringify(recipe, null, 2)}\n`,
    );
    return corpus;
  }

  const issue = {
    message:
      "corpus/recipes/fixture-skill.json files[0].passages[0].edits[0].reason: the fill marker <<fill>> is left: draft proposes, and every marker is filled before render, verify or record",
  };

  it("is refused by render, which writes nothing", () => {
    expect(renderVerb(markedCorpus(), "fixture-skill").output).toEqual({
      verb: "render",
      skill: "fixture-skill",
      wrote: [],
      refused: [{ skill: "fixture-skill", issues: [issue] }],
    });
  });

  it("is refused by verify", () => {
    const outcome = verifyVerb(markedCorpus(), []);
    expect(outcome.failed).toBe(true);
    expect(outcome.output.refused).toEqual([{ skill: "fixture-skill", issues: [issue] }]);
  });

  it("is refused by record, which writes no entry", () => {
    const corpus = markedCorpus();
    const entry = (text: string) => {
      const path = join(temporary("greenline-entry-"), "entry.json");
      writeFileSync(path, text);
      return recordVerb(corpus, path);
    };
    const [sourceRead, change] = chainTexts(fixtureEntries().slice(0, 2));
    expect(entry(sourceRead?.text ?? "").failed).toBe(false);
    const outcome = entry(change?.text ?? "");
    expect(outcome.output.refused).toEqual([
      { entry: "2026-10-05-fixture-skill-recipe", message: issue.message },
    ]);
    expect(readdirSync(join(corpus, "ledger/entries"))).toEqual([sourceRead?.name]);
  });
});

/**
 * The fixture's snapshots with \`fixture/notes.md\` replaced, as an upstream
 * whose support page ends other than with one newline.
 * @param notes the upstream support page's text
 * @returns the snapshots
 */
function snapshotsWithNotes(notes: string): Snapshots {
  const text = (name: SourceName, file: string): string | undefined =>
    name === SOURCE && file === "fixture/notes.md" ? notes : fixtureSnapshots.text(name, file);
  return {
    sources: fixtureSnapshots.sources,
    text,
    bytes: (name, file) => {
      const found = text(name, file);
      return found === undefined ? undefined : encoder.encode(found);
    },
  };
}

describe("a prose file's ending (diagram-design's CRLF page, close's ADR pages with no final newline)", () => {
  for (const [label, notes, ending] of [
    ["a carriage return and a newline", UPSTREAM_NOTES.replaceAll("\n", "\r\n"), "\r\n"],
    ["nothing", UPSTREAM_NOTES.slice(0, -1), ""],
  ] as const)
    it(`states the ending '${JSON.stringify(ending)}' when the copy ends with ${label}, and renders the file byte for byte`, () => {
      const snapshots = snapshotsWithNotes(notes);
      const copy = [
        ...COPY.filter((file) => file.path !== "notes.md"),
        { path: "notes.md", bytes: encoder.encode(notes) },
      ];
      const result = draftRecipe({
        skill: "fixture-skill",
        source,
        upstream: "fixture",
        snapshots,
        copy,
        stub: false,
      });
      if (result._tag === "err") throw result.error;
      const text = recipeText(result.value.recipe);
      expect(text).toContain(`      "ending": ${JSON.stringify(ending)}\n`);
      const notesFile = result.value.recipe.files.find((file) => file.path === "notes.md");
      expect(notesFile?.ending).toBe(ending);
      expect(notesFile?.passages).toEqual([
        {
          passage: "taken",
          source,
          file: "fixture/notes.md",
          segments: [...NOTES_IDS],
          edits: [],
          join: undefined,
        },
      ]);
      const reparsed = parseRecipe(
        text
          .replaceAll(`"<<fill>>"`, `"scope"`)
          .replace(
            /"kind": "scope",\n(\s*)"reason": "scope"/g,
            `"kind": "scope",\n$1"reason": "a reason"`,
          ),
        "fixture.json",
      );
      if (reparsed._tag === "err") throw reparsed.error;
      const checked = checkRecipe(reparsed.value, snapshots);
      if (checked._tag === "err") throw checked.error;
      const rendered = renderSkill(checked.value).find((file) => file.path === "notes.md");
      expect(new TextDecoder().decode(rendered?.bytes)).toBe(notes);
      expect(compareSkill(renderSkill(checked.value), copy)).toEqual([]);
    });

  it("refuses an ending outside the three", () => {
    const recipe = fixtureRecipe();
    const notes = recipe.files[1];
    if (notes === undefined) throw new Error("the fixture has notes.md");
    notes.ending = "\n\n";
    const result = parseRecipe(JSON.stringify(recipe), "fixture.json");
    expect(result._tag === "err" ? result.error.issues.map((issue) => issue.path) : []).toEqual([
      "files[1].ending",
    ]);
  });
});

/** The bytes of architecture-map's authored viewer shell, in miniature. */
const SHELL = "<!doctype html>\n<p>__GL_MAP_DATA__</p>\n";

describe("an authored file (architecture-map's assets/gl-shell.html)", () => {
  const shellCopy = [...COPY, { path: "assets/shell.html", bytes: encoder.encode(SHELL) }];

  it("holds a file that is not prose and that the snapshot does not hold by its digest, its account left as the fill marker", () => {
    const result = draftRecipe({
      skill: "fixture-skill",
      source,
      upstream: "fixture",
      snapshots: fixtureSnapshots,
      copy: shellCopy,
      stub: false,
    });
    if (result._tag === "err") throw result.error;
    expect(result.value.recipe.copies).toEqual([
      { path: "run.sh", source, file: "fixture/run.sh" },
      {
        path: "assets/shell.html",
        sha256: sha256(SHELL),
        kind: "scope",
        reason: "<<fill>>",
      },
    ]);
    expect(recipeText(result.value.recipe)).toContain(
      `    {\n      "path": "assets/shell.html",\n      "sha256": "${sha256(SHELL)}",\n      "kind": "<<fill>>",\n`,
    );
    const checked = checkRecipe(result.value.recipe, fixtureSnapshots);
    if (checked._tag === "err") throw checked.error;
    const rendered = renderSkill(checked.value);
    expect(rendered.map((file) => file.path)).not.toContain("assets/shell.html");
    expect(checked.value.authored).toEqual([{ path: "assets/shell.html", sha256: sha256(SHELL) }]);
    expect(compareSkill(rendered, shellCopy, checked.value.authored)).toEqual([]);
    expect(
      compareSkill(
        rendered,
        COPY.concat({ path: "assets/shell.html", bytes: encoder.encode(`${SHELL}<!-- -->\n`) }),
        checked.value.authored,
      ),
    ).toEqual([{ path: "assets/shell.html", difference: "changed" }]);
    expect(compareSkill(rendered, COPY, checked.value.authored)).toEqual([
      { path: "assets/shell.html", difference: "missing" },
    ]);
  });

  it("refuses a copy with both a source and a digest, a digest without its kind and reason, and an authored method", () => {
    const message =
      "a copy has a source and a file, or an authored file's sha256 with its kind and reason, never both";
    const recipe = fixtureRecipe();
    recipe.copies = [
      { path: "run.sh", source: SOURCE, file: "fixture/run.sh", sha256: sha256(SHELL) },
      { path: "assets/shell.html", sha256: sha256(SHELL) },
      { path: "assets/method.html", sha256: sha256(SHELL), kind: "method", reason: "a method" },
    ];
    const result = parseRecipe(JSON.stringify(recipe), "fixture.json");
    expect(
      result._tag === "err" ? result.error.issues.map((issue) => [issue.path, issue.message]) : [],
    ).toEqual([
      ["copies[0]", message],
      ["copies[1]", message],
      ["copies[2]", "an authored file carries no method, so its kind is one of the other six"],
    ]);
    recipe.copies = [
      {
        path: "assets/ruled.html",
        sha256: sha256(SHELL),
        kind: "pointer",
        reason: "a viewer",
        ruling: "a ruling",
      },
    ];
    const ruled = parseRecipe(JSON.stringify(recipe), "fixture.json");
    expect(ruled._tag === "err" ? ruled.error.issues.map((issue) => issue.path) : []).toEqual([
      "copies[0]",
    ]);
  });

  it("is required by verify at its digest: a changed authored file is named and verify fails", () => {
    const corpus = temporary("greenline-authored-");
    writeFixtureCorpus(corpus, { skillDirectory: true, recorded: false });
    const recipe = fixtureRecipe();
    recipe.copies.push({
      path: "assets/shell.html",
      sha256: sha256(SHELL),
      kind: "pointer",
      reason: "the map viewer shell replaces the upstream bundler and CI steps",
    });
    writeTree(
      corpus,
      new Map([
        ["recipes/fixture-skill.json", `${JSON.stringify(recipe, null, 2)}\n`],
        ["skills/fixture-skill/assets/shell.html", SHELL],
      ]),
    );
    expect(verifyVerb(corpus, ["fixture-skill"]).output.differences).toEqual([]);
    expect(renderVerb(corpus, "fixture-skill").output.wrote).not.toContain("assets/shell.html");
    writeFileSync(join(corpus, "skills/fixture-skill/assets/shell.html"), `${SHELL}<!-- -->\n`);
    const outcome = verifyVerb(corpus, ["fixture-skill"]);
    expect(outcome.failed).toBe(true);
    expect(outcome.output.differences).toEqual([
      { skill: "fixture-skill", path: "assets/shell.html", difference: "changed" },
    ]);
    expect(measureVerb(corpus, ["fixture-skill"]).output.measures[0]?.sources).toEqual(
      measureOfFixture(),
    );
  });
});

/** The fixture recipe's measure per source, which an authored file leaves unchanged. */
function measureOfFixture() {
  const corpus = temporary("greenline-measure-");
  writeFixtureCorpus(corpus, { skillDirectory: true, recorded: false });
  return measureVerb(corpus, ["fixture-skill"]).output.measures[0]?.sources;
}

/** A native skill's committed SKILL.md: plain front matter, a title and opening, two sections, a fenced heading that opens none, and three blank lines before the last. */
const NATIVE_SKILL = `---
name: fixture-skill
description: "A native fixture: written here, copied from no upstream."
source: greenline native fixture
---

# Native fixture

The opening says what the skill is for.

## Decide

Decide first.

\`\`\`
## not a section
\`\`\`


## Report

Report last.
`;

/** A native support page with no front matter, ending with no newline. */
const NATIVE_NOTES = "# Notes\n\nAn opening.\n\n## One\n\nThe one section.";

/** The canonical form of the native SKILL.md's front matter. */
const NATIVE_FRONT = `---
name: "fixture-skill"
description: "A native fixture: written here, copied from no upstream."
source: "greenline native fixture"
---
`;

const native = { kind: "method", reason: "<<fill>>", ruling: "<<fill>>" };

describe("a native skill (draft --native)", () => {
  const nativeCopy = [
    { path: "SKILL.md", bytes: encoder.encode(NATIVE_SKILL) },
    { path: "notes.md", bytes: encoder.encode(NATIVE_NOTES) },
    { path: "run.sh", bytes: encoder.encode(UPSTREAM_SCRIPT) },
  ];

  it("proposes written passages, one per top-level section, each a method item with its reason and ruling to fill, and no source", () => {
    const result = draftNative({ skill: "fixture-skill", copy: nativeCopy });
    if (result._tag === "err") throw result.error;
    expect(result.value.todos).toBe(11);
    expect(asFile(recipeText(result.value.recipe))).toEqual({
      schema: "greenline.recipe/v1",
      name: "fixture-skill",
      frontMatter: [
        { field: "name", value: "fixture-skill" },
        {
          field: "description",
          value: "A native fixture: written here, copied from no upstream.",
        },
        { field: "source", value: "greenline native fixture" },
      ],
      sources: [],
      files: [
        {
          path: "SKILL.md",
          passages: [
            {
              passage: "written",
              text: "# Native fixture\n\nThe opening says what the skill is for.",
              ...native,
            },
            {
              passage: "written",
              text: "## Decide\n\nDecide first.\n\n```\n## not a section\n```",
              ...native,
            },
            { passage: "written", text: "## Report\n\nReport last.", ...native, join: "\n\n\n" },
          ],
        },
        {
          path: "notes.md",
          passages: [
            { passage: "written", text: "# Notes\n\nAn opening.", ...native },
            { passage: "written", text: "## One\n\nThe one section.", ...native },
          ],
          ending: "",
        },
      ],
      copies: [{ path: "run.sh", sha256: sha256(UPSTREAM_SCRIPT), ...todo }],
      drops: [],
    });
  });

  it("renders its directory with the front matter canonical and every body byte unchanged", () => {
    const result = draftNative({ skill: "fixture-skill", copy: nativeCopy });
    if (result._tag === "err") throw result.error;
    const checked = checkRecipe(result.value.recipe, fixtureSnapshots);
    if (checked._tag === "err") throw checked.error;
    const rendered = renderSkill(checked.value);
    const skill = new TextDecoder().decode(
      rendered.find((file) => file.path === "SKILL.md")?.bytes,
    );
    expect(skill).toBe(NATIVE_FRONT + NATIVE_SKILL.slice(NATIVE_SKILL.indexOf("\n---\n") + 5));
    expect(compareSkill(rendered, result.value.normalized, checked.value.authored)).toEqual([]);
    expect(compareSkill(rendered, nativeCopy, checked.value.authored)).toEqual([
      { path: "SKILL.md", difference: "changed", line: 2 },
    ]);
  });

  it("refuses front matter that is neither plain nor double-quoted, or a plain value YAML reads as no string", () => {
    for (const value of ["'greenline native fixture'", "true", "null", "~", "12", "1.5", "no"]) {
      const result = draftNative({
        skill: "fixture-skill",
        copy: [
          {
            path: "SKILL.md",
            bytes: encoder.encode(
              NATIVE_SKILL.replace("source: greenline native fixture", `source: ${value}`),
            ),
          },
        ],
      });
      expect(result._tag === "err" ? result.error.issues : []).toEqual([
        {
          message:
            "'SKILL.md' has no front matter of plain or double-quoted fields and a blank line after it",
        },
      ]);
    }
  });

  it("refuses a body opening with white space, an ending outside the three, and front matter in a support page", () => {
    const front = NATIVE_SKILL.slice(0, NATIVE_SKILL.indexOf("\n---\n") + 5);
    const result = draftNative({
      skill: "fixture-skill",
      copy: [
        { path: "SKILL.md", bytes: encoder.encode(`${front}\n\n# Native fixture\n`) },
        { path: "notes.md", bytes: encoder.encode(`${NATIVE_NOTES}\n\n`) },
        { path: "more.md", bytes: encoder.encode(`${front}\n# More\n`) },
      ],
    });
    expect(result._tag === "err" ? result.error.issues : []).toEqual([
      { message: "'SKILL.md' opens its body with white space, which no passage carries" },
      { message: `'notes.md' ends with '"\\n\\n"', which no ending states` },
      { message: "'more.md' has front matter, which only SKILL.md carries" },
    ]);
  });

  /** The fixture's corpus on disk with the skill native: no upstream in the manifest, its committed directory, and no recipe. */
  function nativeCorpus(): string {
    const corpus = temporary("greenline-native-");
    writeFixtureCorpus(corpus, { skillDirectory: false, recorded: false });
    rmSync(join(corpus, "recipes/fixture-skill.json"));
    writeTree(
      corpus,
      new Map([
        ["skills/fixture-skill/SKILL.md", NATIVE_SKILL],
        ["skills/fixture-skill/notes.md", NATIVE_NOTES],
      ]),
    );
    return corpus;
  }

  it("is drafted by the verb only with --native, never under corpus/skills/, and render then writes the canonical front matter", () => {
    const corpus = nativeCorpus();
    const before = skillDigests(corpus);
    expect(draftVerb(corpus, "fixture-skill", "native").output).toEqual({
      verb: "draft",
      skill: "fixture-skill",
      wrote: "corpus/recipes/fixture-skill.json",
      todos: 10,
      differences: [],
      refused: [],
    });
    expect(skillDigests(corpus)).toEqual(before);
    const path = join(corpus, "recipes/fixture-skill.json");
    writeFileSync(
      path,
      readFileSync(path, "utf8").replaceAll(
        `"reason": "<<fill>>",\n          "ruling": "<<fill>>"`,
        `"reason": "what the section is for",\n          "ruling": "the fixture's ruling"`,
      ),
    );
    expect(renderVerb(corpus, "fixture-skill").output.refused).toEqual([]);
    expect(readFileSync(join(corpus, "skills/fixture-skill/SKILL.md"), "utf8")).toBe(
      NATIVE_FRONT + NATIVE_SKILL.slice(NATIVE_SKILL.indexOf("\n---\n") + 5),
    );
    expect(readFileSync(join(corpus, "skills/fixture-skill/notes.md"), "utf8")).toBe(NATIVE_NOTES);
    expect(verifyVerb(corpus, ["fixture-skill"]).output.differences).toEqual([]);
  });

  it("refuses --native for a skill copied from an upstream", () => {
    expect(draftVerb(copyCorpus(), "fixture-skill", "native").output.refused).toEqual([
      {
        skill: "fixture-skill",
        issues: [
          {
            message: `'fixture-skill' was copied from '${SOURCE}'; draft --native proposes the recipe of a skill copied from no upstream`,
          },
        ],
      },
    ]);
  });
});

describe("the places in this tree that need the authored file and the endings", () => {
  const corpus = join(import.meta.dirname, "..", "..", "corpus");

  /** A skill of this tree drafted as a copy, from its committed directory and its snapshot. */
  function draftedFromTree(skill: string) {
    const manifest = readManifest(corpus);
    const snapshots = readSnapshots(corpus);
    if (manifest._tag === "err") throw manifest.error;
    if (snapshots._tag === "err") throw snapshots.error;
    const upstream = manifest.value.skills.find((entry) => entry.name === skill)?.upstream;
    if (upstream === undefined) throw new Error(`${skill} is a copy`);
    const copy = readSkillDirectory(corpus, skill);
    const result = draftRecipe({
      skill,
      // SAFETY: the manifest's parse checks every skill's upstream family is a pinned source.
      source: upstream.family as SourceName,
      upstream: upstream.name,
      snapshots: snapshots.value,
      copy,
      stub: false,
    });
    if (result._tag === "err") throw result.error;
    const checked = checkRecipe(result.value.recipe, snapshots.value);
    if (checked._tag === "err") throw checked.error;
    return { recipe: result.value.recipe, checked: checked.value, copy };
  }

  it("drafts architecture-map with its viewer shell authored, by the digest of its committed bytes", () => {
    const { recipe, checked, copy } = draftedFromTree("architecture-map");
    const shell = copy.find((file) => file.path === "assets/gl-shell.html");
    if (shell === undefined) throw new Error("the shell is committed");
    expect(recipe.copies.filter((item) => "sha256" in item)).toEqual([
      {
        path: "assets/gl-shell.html",
        sha256: createHash("sha256").update(shell.bytes).digest("hex"),
        kind: "scope",
        reason: "<<fill>>",
      },
    ]);
    expect(compareSkill(renderSkill(checked), copy, checked.authored)).toEqual([]);
  });

  it("drafts diagram-design's CRLF page, stating its ending", () => {
    const { recipe, checked, copy } = draftedFromTree("diagram-design");
    expect(recipe.files.find((file) => file.path === "references/primitive-icons.md")?.ending).toBe(
      "\r\n",
    );
    expect(compareSkill(renderSkill(checked), copy, checked.authored)).toEqual([]);
  });

  it("keeps close's two ADR pages with no final newline, as the gist upstream holds them, each stating its ending", () => {
    // record-architecture-decisions' README and template, whose draft first
    // stated the empty ending (S11d), are close's adr/ pages since S14.
    const snapshots = readSnapshots(corpus);
    if (snapshots._tag === "err") throw snapshots.error;
    const recipe = parseRecipe(
      readFileSync(join(corpus, "recipes/close.json"), "utf8"),
      "close.json",
    );
    if (recipe._tag === "err") throw recipe.error;
    for (const path of ["adr/README.md", "adr/template.md"])
      expect(recipe.value.files.find((file) => file.path === path)?.ending).toBe("");
    const checked = checkRecipe(recipe.value, snapshots.value);
    if (checked._tag === "err") throw checked.error;
    const copy = readSkillDirectory(corpus, "close");
    for (const path of ["adr/README.md", "adr/template.md"])
      expect(copy.find((file) => file.path === path)?.bytes.at(-1)).not.toBe(0x0a);
    expect(compareSkill(renderSkill(checked.value), copy, checked.value.authored)).toEqual([]);
  });
});
