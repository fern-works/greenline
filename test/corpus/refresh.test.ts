/** The refresh (`src/corpus/refresh.ts`, the fetch in `src/corpus/tree.ts`, `refresh` and `verify` in `src/corpus/instrument.ts`): a source at a new commit, every recipe re-anchored, nothing unread; fetched from a local repository, never the network. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseJson } from "../../src/core/contract.ts";
import { parseCorpusManifest } from "../../src/core/corpus.ts";
import {
  recordVerb,
  refreshVerb,
  renderVerb,
  verifyVerb,
  type RefreshRequest,
} from "../../src/corpus/instrument.ts";
import {
  checkRecipe,
  FILL_MARKER,
  parseRecipe,
  type Snapshots,
  type SourceName,
} from "../../src/corpus/recipe.ts";
import { recipeText } from "../../src/corpus/draft.ts";
import { manifestWithSources, reanchor, sourceSnapshot } from "../../src/corpus/refresh.ts";
import { renderSkill } from "../../src/corpus/render.ts";
import { segmentProse } from "../../src/corpus/segments.ts";
import { readSnapshotFiles } from "../../src/corpus/tree.ts";
import { entryText, fixtureEntries } from "../fixtures/chain.ts";
import { RECORDED, writeFixtureCorpus } from "../fixtures/corpus-disk.ts";
import {
  COMMIT,
  fixtureRecipe,
  fixtureSnapshots,
  NOTES_IDS,
  SKILL_IDS,
  SOURCE,
  TINY_SKILL,
  UPSTREAM_LICENCE,
  UPSTREAM_NOTES,
  UPSTREAM_SCRIPT,
  UPSTREAM_SKILL,
  WRITTEN,
} from "../fixtures/recipe.ts";
import {
  CHANGED,
  ENTRIES,
  GIT_ENVIRONMENT,
  INSERTED,
  NEXT_FILES,
  NEXT_SCRIPT,
  NEXT_SKILL,
  READ_SKILL,
  REMOVED,
  upstreamFiles,
  upstreamRepository,
  type TreeEntry,
} from "../fixtures/refresh.ts";

const repository = join(import.meta.dirname, "..", "..");
const made: string[] = [];
const encoder = new TextEncoder();
const sha256 = (text: string | Uint8Array): string =>
  createHash("sha256").update(text).digest("hex");
const idOf = (text: string): string => sha256(text).slice(0, 12);

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
const FILE = "fixture/SKILL.md";
const NEXT = "b".repeat(40);

/** The fixture source's snapshot at the second commit, by its path in the snapshot. */
const NEXT_SNAPSHOT: ReadonlyMap<string, string> = new Map([
  ["LICENSE", UPSTREAM_LICENCE],
  [FILE, NEXT_SKILL],
  ["fixture/notes.md", UPSTREAM_NOTES],
  ["fixture/run.sh", NEXT_SCRIPT],
  ["tiny/SKILL.md", TINY_SKILL],
]);

const OLD_SNAPSHOT: ReadonlyMap<string, string> = new Map([
  ["LICENSE", UPSTREAM_LICENCE],
  [FILE, UPSTREAM_SKILL],
  ["fixture/notes.md", UPSTREAM_NOTES],
  ["fixture/run.sh", UPSTREAM_SCRIPT],
  ["tiny/SKILL.md", TINY_SKILL],
]);

function held(files: ReadonlyMap<string, string>) {
  return {
    text: (file: string) => files.get(file),
    bytes: (file: string) => {
      const text = files.get(file);
      return text === undefined ? undefined : encoder.encode(text);
    },
    files: [...files.keys()].sort(),
  };
}

/** The snapshots with the fixture source read at the second commit. */
const nextSnapshots: Snapshots = {
  sources: fixtureSnapshots.sources,
  text: (name, file) =>
    name === source ? NEXT_SNAPSHOT.get(file) : fixtureSnapshots.text(name, file),
  bytes: (name, file) =>
    name === source ? held(NEXT_SNAPSHOT).bytes(file) : fixtureSnapshots.bytes(name, file),
};

/** A recipe, the fixture's by default, in the form `draft` and `refresh` write it. */
function fixtureText(recipe = fixtureRecipe()): string {
  const parsed = parseRecipe(JSON.stringify(recipe), "fixture");
  if (parsed._tag === "err") throw parsed.error;
  return recipeText(parsed.value);
}

/** A recipe, the fixture's by default, re-anchored to the second commit, in memory. */
function reanchored(recipe = fixtureRecipe()) {
  const parsed = parseRecipe(fixtureText(recipe), "fixture");
  if (parsed._tag === "err") throw parsed.error;
  const checked = checkRecipe(parsed.value, fixtureSnapshots);
  if (checked._tag === "err") throw checked.error;
  return reanchor({
    checked: checked.value,
    text: fixtureText(recipe),
    source,
    commit: NEXT,
    before: sourceSnapshot(fixtureSnapshots, source, [...OLD_SNAPSHOT.keys()].sort()),
    after: held(NEXT_SNAPSHOT),
  });
}

/** A reader's pass over a re-anchored recipe's text: every kind and reason the marker holds filled, every reverting edit kept. */
function filled(text: string): string {
  const marker = JSON.stringify(FILL_MARKER);
  return text
    .replaceAll(`"kind": ${marker}`, '"kind": "correction"')
    .replaceAll(marker, '"read at the refresh"');
}

/** The taken passages of a recipe's JSON text, with their segments and edits. */
function takenPassages(text: string): {
  readonly segments: readonly string[];
  readonly edits: readonly { readonly segment: string; readonly kind: string }[];
}[] {
  // SAFETY: the text is the re-anchored recipe just written, whose shape the recipe schema fixes; the test reads its taken passages only.
  const recipe = JSON.parse(text) as {
    files: {
      passages: {
        passage: string;
        segments?: string[];
        edits?: { segment: string; kind: string }[];
      }[];
    }[];
  };
  return recipe.files.flatMap((file) =>
    file.passages.flatMap((item) =>
      item.passage === "taken" ? [{ segments: item.segments ?? [], edits: item.edits ?? [] }] : [],
    ),
  );
}

describe("reanchor", () => {
  it("keeps the unchanged ids and their edits, lists the changed and the inserted, drops the removed and names the moved", () => {
    const { report } = reanchored();
    expect(report).toEqual({
      skill: "fixture-skill",
      changed: [
        {
          file: FILE,
          segment: SKILL_IDS[1],
          text: CHANGED.was,
          now: { segment: idOf(CHANGED.now), text: CHANGED.now },
          taken: true,
          edits: [
            {
              find: "say back what you heard",
              replace: "restate what you heard",
              occursOnce: true,
            },
          ],
          keepFits: true,
        },
      ],
      inserted: [{ file: FILE, segment: idOf(INSERTED), text: INSERTED }],
      removed: [{ file: FILE, segment: SKILL_IDS[3], text: REMOVED, taken: true }],
      moved: [{ file: FILE, segment: SKILL_IDS[8] }],
      separators: [],
      copies: [{ path: "scripts/run.sh", file: "fixture/run.sh", change: "changed" }],
      added: [],
      stubs: [],
      markers: 7,
      rewrites: true,
    });
  });

  it("points a drop's replacing passage at its new place when a passage splits", () => {
    const { text } = reanchored();
    // SAFETY: the re-anchored recipe just written; the test reads its drops and passages only.
    const recipe = JSON.parse(text) as {
      files: { passages: { passage: string; text?: string }[] }[];
      drops: { segment: string; replacedBy?: { path: string; passage: number } }[];
    };
    const drop = recipe.drops.find((entry) => entry.segment === SKILL_IDS[7]);
    expect(drop?.replacedBy).toEqual({ path: "SKILL.md", passage: 2 });
    expect(recipe.files[0]?.passages[2]).toMatchObject({ passage: "written", text: WRITTEN });
  });

  it("writes the recipe with a marker on every listed place, so the parse refuses it", () => {
    const { text } = reanchored();
    const recipe = parseJson(text);
    expect(JSON.stringify(recipe)).toContain(`"reason":"removed upstream at ${NEXT}"`);
    const parsed = parseRecipe(text, "fixture");
    expect(parsed._tag).toBe("err");
    if (parsed._tag === "ok") return;
    expect(parsed.error.issues.map((issue) => issue.path).sort()).toEqual(
      [
        "copies[0].kind",
        "copies[0].reason",
        "drops[1].kind",
        "drops[1].reason",
        "drops[2].kind",
        "files[0].passages[0].edits[0].kind",
        "files[0].passages[0].edits[0].reason",
      ].sort(),
    );
  });

  it("S1 keeps the gist of an account whose reason it keeps, and leaves out the gist of a drop whose reason it rewrites", () => {
    const recipe = fixtureRecipe();
    const passage = recipe.files[0]?.passages[0];
    const kept = recipe.drops[0];
    if (passage?.passage !== "taken" || kept === undefined)
      throw new Error("the fixture takes its first passage and drops a segment");
    passage.segments = passage.segments.filter((segment) => segment !== SKILL_IDS[3]);
    Object.assign(kept, { gist: "Leaves out a sentence that only announces the drop" });
    recipe.drops.push({
      source,
      file: FILE,
      segment: SKILL_IDS[3],
      kind: "scope",
      reason: "the fixture drops it",
      ...{ gist: "Drops the fixture's sentence" },
    });
    const { text } = reanchored(recipe);
    // SAFETY: the re-anchored recipe just written; the test reads its drops only.
    const drops = (
      JSON.parse(text) as { drops: { segment: string; reason: string; gist?: string }[] }
    ).drops;
    expect(drops.find((drop) => drop.segment === SKILL_IDS[7])).toMatchObject({
      reason: "it only announces the drop",
      gist: "Leaves out a sentence that only announces the drop",
    });
    const removed = drops.find((drop) => drop.segment === SKILL_IDS[3]);
    expect(removed?.reason).toBe(`removed upstream at ${NEXT}`);
    expect(removed).not.toHaveProperty("gist");
  });

  it("lets no unread segment enter a passage: every segment the new file changed or inserted that a passage takes carries a marked edit", () => {
    const { text } = reanchored();
    const before = new Set(segmentProse(UPSTREAM_SKILL).segments.map((segment) => segment.text));
    const after = new Map<string, string>(
      segmentProse(NEXT_SKILL).segments.map((segment) => [segment.id, segment.text]),
    );
    let unread = 0;
    for (const passage of takenPassages(text))
      for (const id of passage.segments) {
        const now = after.get(id);
        if (now === undefined || before.has(now)) continue;
        unread += 1;
        expect(passage.edits.some((edit) => edit.segment === id && edit.kind === FILL_MARKER)).toBe(
          true,
        );
      }
    expect(unread).toBe(1);
    const inserted = idOf(INSERTED);
    expect(takenPassages(text).some((passage) => passage.segments.includes(inserted))).toBe(false);
  });

  it("checks against the new snapshot once read, and renders the text that was read less the removed sentence", () => {
    const { text } = reanchored();
    const parsed = parseRecipe(filled(text), "fixture");
    if (parsed._tag === "err") throw parsed.error;
    const checked = checkRecipe(parsed.value, nextSnapshots);
    if (checked._tag === "err") throw checked.error;
    const skill = renderSkill(checked.value).find((file) => file.path === "SKILL.md");
    expect(new TextDecoder().decode(skill?.bytes)).toBe(READ_SKILL);
  });

  it("re-anchors a recipe against its own snapshot to the same bytes, listing nothing", () => {
    const parsed = parseRecipe(fixtureText(), "fixture");
    if (parsed._tag === "err") throw parsed.error;
    const checked = checkRecipe(parsed.value, fixtureSnapshots);
    if (checked._tag === "err") throw checked.error;
    const same = held(OLD_SNAPSHOT);
    const { report, text } = reanchor({
      checked: checked.value,
      text: fixtureText(),
      source,
      commit: COMMIT,
      before: same,
      after: same,
    });
    expect(text).toBe(fixtureText());
    expect(report).toMatchObject({
      changed: [],
      inserted: [],
      removed: [],
      markers: 0,
      rewrites: false,
    });
  });

  it("leaves a credit's ruling and a not-a-stub ruling to the operator when the upstream body changed", () => {
    const recipe = fixtureRecipe();
    recipe.notStub = [{ source: SOURCE, file: "tiny/SKILL.md", ruling: "ruled not a stub" }];
    recipe.files[0]?.passages.push({
      passage: "taken",
      source: SOURCE,
      file: "tiny/SKILL.md",
      segments: segmentProse(TINY_SKILL).segments.map((segment) => segment.id),
    });
    const text = `${JSON.stringify(recipe, null, 2)}\n`;
    const parsed = parseRecipe(text, "fixture");
    if (parsed._tag === "err") throw parsed.error;
    const checked = checkRecipe(parsed.value, fixtureSnapshots);
    if (checked._tag === "err") throw checked.error;
    const grown = `${TINY_SKILL}\nFirst read the request. Then write the test.\n`;
    const after = held(new Map([...OLD_SNAPSHOT, ["tiny/SKILL.md", grown]]));
    const result = reanchor({
      checked: checked.value,
      text,
      source,
      commit: NEXT,
      before: held(OLD_SNAPSHOT),
      after,
    });
    expect(result.report.stubs).toEqual([
      {
        file: "tiny/SKILL.md",
        words: 15,
        message:
          "the body ruled not a stub 'tiny/SKILL.md' changed upstream, now 15 words of body: does it state a method of its own, with steps, an order or criteria? The operator rules it again",
      },
    ]);
    expect(JSON.parse(result.text).notStub).toEqual([
      { source: SOURCE, file: "tiny/SKILL.md", ruling: FILL_MARKER },
    ]);
  });
});

describe("the drop of a segment upstream removed", () => {
  function withDrop(reason: string) {
    const recipe = fixtureRecipe();
    recipe.drops.push({
      source: SOURCE,
      file: "fixture/gone.md",
      segment: "0123456789ab",
      kind: "scope",
      reason,
    });
    const parsed = parseRecipe(JSON.stringify(recipe), "fixture");
    if (parsed._tag === "err") throw parsed.error;
    return checkRecipe(parsed.value, fixtureSnapshots);
  }

  it("is accepted though the snapshot no longer holds the segment or its file", () => {
    expect(withDrop(`removed upstream at ${NEXT}`)._tag).toBe("ok");
  });

  it("is the only drop of an unknown segment the check accepts", () => {
    const checked = withDrop("removed upstream");
    expect(checked._tag === "err" ? checked.error.issues : []).toEqual([
      { message: `the snapshot of '${SOURCE}' has no file 'fixture/gone.md'` },
    ]);
  });
});

describe("manifestWithSources", () => {
  it("gives this tree's manifest back byte for byte with its own sources", () => {
    const text = readFileSync(join(repository, "corpus", "manifest.json"), "utf8");
    const manifest = parseCorpusManifest(text, "corpus/manifest.json");
    if (manifest._tag === "err") throw manifest.error;
    expect(manifestWithSources(text, manifest.value.sources)).toBe(text);
  });
});

/** A fixture corpus on disk, recorded, whose source is a local repository at two commits and whose old snapshot's inventory names its entries. */
function corpusWithUpstream(later: readonly ReadonlyMap<string, string>[] = []) {
  const root = temporary("greenline-refresh-");
  const corpus = join(root, "corpus");
  writeFixtureCorpus(corpus, { skillDirectory: true, recorded: true });
  const upstream = upstreamRepository(join(root, "upstream"), [
    upstreamFiles(UPSTREAM_SKILL, UPSTREAM_SCRIPT),
    NEXT_FILES,
    ...later,
  ]);
  const manifestPath = join(corpus, "manifest.json");
  // SAFETY: the fixture manifest written above; the test rewrites one field and the parse below checks the result.
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    sources: { repo: string }[];
  };
  const pinned = manifest.sources[0];
  if (pinned !== undefined) pinned.repo = upstream.url;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(
    join(corpus, "upstream", SOURCE, `${COMMIT}.inventory.json`),
    `${JSON.stringify({ commit: COMMIT, files: [], entries: ENTRIES }, null, 2)}\n`,
  );
  writeFileSync(join(corpus, "recipes", "fixture-skill.json"), fixtureText());
  return { corpus, upstream };
}

function request(commit: string, change: Partial<RefreshRequest> = {}): RefreshRequest {
  return {
    source: SOURCE,
    commit,
    paths: [],
    anyBranch: false,
    write: false,
    environment: GIT_ENVIRONMENT,
    ...change,
  };
}

function readText(corpus: string, path: string): string {
  return readFileSync(join(corpus, path), "utf8");
}

describe("refresh", () => {
  it("reports the re-anchoring without --write and writes nothing", () => {
    const { corpus, upstream } = corpusWithUpstream();
    const manifest = readText(corpus, "manifest.json");
    const outcome = refreshVerb(corpus, request(upstream.commits[1] ?? ""));
    expect(outcome.failed).toBe(false);
    expect(outcome.output).toMatchObject({
      from: COMMIT,
      to: upstream.commits[1],
      snapshot: `upstream/${SOURCE}/${upstream.commits[1]}`,
      entries: ENTRIES,
      gone: [],
      wrote: [],
      refused: [],
    });
    expect(outcome.output.recipes.map((recipe) => [recipe.skill, recipe.markers])).toEqual([
      ["fixture-skill", 7],
    ]);
    expect(readText(corpus, "manifest.json")).toBe(manifest);
    expect(readText(corpus, "recipes/fixture-skill.json")).toBe(fixtureText());
    expect(existsSync(join(corpus, "upstream", SOURCE, upstream.commits[1] ?? ""))).toBe(false);
  });

  it("with --write snapshots the commit beside the old one, moves the pin and writes the marked recipe that render, verify and record refuse", () => {
    const { corpus, upstream } = corpusWithUpstream();
    const next = upstream.commits[1] ?? "";
    const outcome = refreshVerb(corpus, request(next, { write: true }));
    expect(outcome.output.wrote).toEqual([
      `corpus/upstream/${SOURCE}/${next}/`,
      `corpus/upstream/${SOURCE}/${next}.inventory.json`,
      "corpus/recipes/fixture-skill.json",
      "corpus/manifest.json",
    ]);
    const snapshot = `upstream/${SOURCE}/${next}`;
    expect(
      [...readSnapshotFiles(corpus, snapshot)].map(([path, bytes]) => [
        path,
        new TextDecoder().decode(bytes),
      ]),
    ).toEqual([...NEXT_SNAPSHOT].sort(([left], [right]) => (left < right ? -1 : 1)));
    expect(JSON.parse(readText(corpus, `${snapshot}.inventory.json`))).toEqual({
      commit: next,
      files: [...NEXT_SNAPSHOT.keys()].sort().map((path) => ({
        path,
        sha256: sha256(NEXT_SNAPSHOT.get(path) ?? ""),
      })),
      entries: ENTRIES,
    });
    const manifest = parseCorpusManifest(readText(corpus, "manifest.json"), "manifest");
    if (manifest._tag === "err") throw manifest.error;
    expect(manifest.value.sources[0]).toMatchObject({ commit: next, snapshot });
    expect(existsSync(join(corpus, "upstream", SOURCE, COMMIT))).toBe(true);
    expect(readText(corpus, "recipes/fixture-skill.json")).toBe(reanchoredOnDisk(next));

    const marker = `the fill marker ${FILL_MARKER} is left`;
    const rendered = renderVerb(corpus, "fixture-skill");
    expect(rendered.failed).toBe(true);
    expect(JSON.stringify(rendered.output.refused)).toContain(marker);
    const verified = verifyVerb(corpus, []);
    expect(verified.failed).toBe(true);
    expect(JSON.stringify(verified.output.refused)).toContain(marker);
    expect(verified.output.snapshots).toEqual([
      {
        source: SOURCE,
        commit: COMMIT,
        snapshot: `upstream/${SOURCE}/${COMMIT}`,
        recipes: [],
        removable: true,
      },
    ]);
    const [, change] = fixtureEntries();
    if (change === undefined) throw new Error("the fixture holds a change");
    change.id = "2026-10-08-fixture-skill-refreshed";
    const entry = join(temporary("greenline-entry-"), "entry.json");
    writeFileSync(
      entry,
      entryText(change, {
        id: "2026-10-05-fixture-skill-recipe",
        sha256: sha256(RECORDED[1]?.text ?? ""),
      }),
    );
    const recorded = recordVerb(corpus, entry);
    expect(recorded.failed).toBe(true);
    expect(JSON.stringify(recorded.output.refused)).toContain(marker);
  });

  it("refuses at verify a recipe the refresh left at a commit the manifest no longer pins, and keeps that snapshot", () => {
    const { corpus, upstream } = corpusWithUpstream();
    expect(refreshVerb(corpus, request(upstream.commits[1] ?? "", { write: true })).failed).toBe(
      false,
    );
    writeFileSync(join(corpus, "recipes", "fixture-skill.json"), fixtureText());
    const verified = verifyVerb(corpus, []);
    expect(verified.output.refused[0]?.issues[0]).toEqual({
      message: `the recipe is anchored at '${SOURCE}' ${COMMIT}, a snapshot the manifest no longer pins: refresh re-anchors it`,
    });
    expect(verified.output.snapshots).toMatchObject([
      { commit: COMMIT, recipes: ["fixture-skill"], removable: false },
    ]);
  });

  it("refuses a commit the default branch does not hold unless --any-branch", () => {
    const { corpus, upstream } = corpusWithUpstream();
    expect(refreshVerb(corpus, request(upstream.side)).output.refused).toEqual([
      {
        skill: "*",
        issues: [
          {
            message: `the default branch of ${upstream.url} does not hold commit ${upstream.side}; refresh reads another branch's commit only with --any-branch`,
          },
        ],
      },
    ]);
    const anyBranch = refreshVerb(corpus, request(upstream.side, { anyBranch: true }));
    expect(anyBranch.output).toMatchObject({ to: upstream.side, refused: [] });
  });

  it("resolves an abbreviated commit, and at the pinned commit fetches nothing and writes nothing", () => {
    const { corpus, upstream } = corpusWithUpstream();
    const short = (upstream.commits[1] ?? "").slice(0, 7);
    expect(refreshVerb(corpus, request(short)).output.to).toBe(upstream.commits[1]);
    const pinned = refreshVerb(corpus, request(COMMIT, { write: true }));
    expect(pinned.output).toMatchObject({ from: COMMIT, to: COMMIT, wrote: [], refused: [] });
    expect(pinned.output.recipes).toMatchObject([
      { skill: "fixture-skill", markers: 0, rewrites: false },
    ]);
  });

  it("adds a new source with its repository, licence and paths, touching no recipe", () => {
    const { corpus, upstream } = corpusWithUpstream();
    const next = upstream.commits[1] ?? "";
    const outcome = refreshVerb(corpus, {
      source: "fixture-new",
      repo: upstream.url,
      licence: "MIT",
      commit: next,
      paths: ["skills/tiny"],
      anyBranch: false,
      write: true,
      environment: GIT_ENVIRONMENT,
    });
    expect(outcome.output).toMatchObject({
      from: null,
      to: next,
      snapshot: `upstream/fixture-new/${next}`,
      entries: [{ name: "tiny", path: "skills/tiny" }],
      recipes: [],
      refused: [],
    });
    const manifest = parseCorpusManifest(readText(corpus, "manifest.json"), "manifest");
    if (manifest._tag === "err") throw manifest.error;
    expect(manifest.value.sources.at(-1)).toEqual({
      name: "fixture-new",
      repo: upstream.url,
      commit: next,
      snapshot: `upstream/fixture-new/${next}`,
      license: "MIT",
    });
    expect([...readSnapshotFiles(corpus, `upstream/fixture-new/${next}`).keys()]).toEqual([
      "LICENSE",
      "tiny/SKILL.md",
    ]);
    expect(readText(corpus, "recipes/fixture-skill.json")).toBe(fixtureText());
    expect(
      refreshVerb(corpus, {
        ...request(next),
        source: "fixture-other",
        repo: upstream.url,
        licence: "Apache-2.0",
        paths: ["skills/tiny"],
      }).output.refused,
    ).toEqual([
      {
        skill: "*",
        issues: [{ message: "the manifest takes the licence class MIT alone, not 'Apache-2.0'" }],
      },
    ]);
  });

  it("refuses two paths of a new source that one entry would hold", () => {
    const { corpus, upstream } = corpusWithUpstream();
    expect(
      refreshVerb(corpus, {
        ...request(upstream.commits[1] ?? ""),
        source: "fixture-new",
        repo: upstream.url,
        licence: "MIT",
        paths: ["skills/tiny", "other/tiny"],
      }).output.refused,
    ).toEqual([
      {
        skill: "*",
        issues: [{ message: "'other/tiny' would be held as 'tiny', which holds 'skills/tiny'" }],
      },
    ]);
  });

  it("names no snapshot as the anchor of a recipe the pinned snapshot accepts and refuses for another reason", () => {
    const { corpus, upstream } = corpusWithUpstream();
    expect(refreshVerb(corpus, request(upstream.commits[1] ?? "", { write: true })).failed).toBe(
      false,
    );
    const notes = fixtureRecipe();
    notes.files = [
      {
        path: "SKILL.md",
        passages: [{ passage: "written", text: "Written.", kind: "home", reason: "the test's" }],
      },
      {
        path: "notes.md",
        passages: [
          { passage: "taken", source: SOURCE, file: "fixture/notes.md", segments: [...NOTES_IDS] },
        ],
      },
    ];
    notes.copies = [];
    notes.drops = [];
    // The file is named for another skill than the recipe: refused after its check passes.
    writeFileSync(join(corpus, "recipes", "notes-skill.json"), JSON.stringify(notes));
    const verified = verifyVerb(corpus, []);
    expect(verified.output.refused.find((refusal) => refusal.skill === "notes-skill")).toEqual({
      skill: "notes-skill",
      issues: [{ message: "'corpus/recipes/notes-skill.json' names the skill 'fixture-skill'" }],
    });
    expect(verified.output.snapshots).toMatchObject([
      { commit: COMMIT, recipes: [], removable: true },
    ]);
  });

  it("refuses a new source's path the commit does not hold, and writes nothing", () => {
    const { corpus, upstream } = corpusWithUpstream();
    const manifest = readText(corpus, "manifest.json");
    const outcome = refreshVerb(corpus, {
      ...request(upstream.commits[1] ?? "", { write: true }),
      source: "fixture-new",
      repo: upstream.url,
      licence: "MIT",
      paths: ["skills/absent"],
    });
    expect(outcome.output.refused).toEqual([
      { skill: "*", issues: [{ message: "the commit holds no 'skills/absent'" }] },
    ]);
    expect(readText(corpus, "manifest.json")).toBe(manifest);
    expect(existsSync(join(corpus, "upstream", "fixture-new"))).toBe(false);
  });
});

/** The fixture licence with another copyright line: a licence that differs. */
const OTHER_LICENCE = UPSTREAM_LICENCE.replace(
  /Copyright[^\n]*/,
  "Copyright (c) 2026 Someone Else",
);

/** A new source refreshed from a one-commit local repository holding `tree` and its links or submodules, at the paths named. */
function newSource(
  tree: ReadonlyMap<string, string>,
  paths: readonly string[],
  entries: ReadonlyMap<string, TreeEntry> = new Map(),
) {
  const root = temporary("greenline-refresh-");
  const corpus = join(root, "corpus");
  writeFixtureCorpus(corpus, { skillDirectory: true, recorded: true });
  writeFileSync(join(corpus, "recipes", "fixture-skill.json"), fixtureText());
  const upstream = upstreamRepository(join(root, "upstream"), [tree], [entries]);
  const commit = upstream.commits[0] ?? "";
  const manifest = readText(corpus, "manifest.json");
  const outcome = refreshVerb(corpus, {
    ...request(commit, { write: true }),
    source: "fixture-new",
    repo: upstream.url,
    licence: "MIT",
    paths,
  });
  return { corpus, commit, manifest, outcome, snapshot: `upstream/fixture-new/${commit}` };
}

describe("R2 the licence of a repository whose root holds none", () => {
  it("R2 takes each entry's nearest licence walking up from its own directory, and holds those bytes as LICENSE", () => {
    const { corpus, outcome, snapshot } = newSource(
      new Map([
        ["plugin/LICENSE", UPSTREAM_LICENCE],
        ["plugin/skills/a/SKILL.md", TINY_SKILL],
        ["plugin/skills/b/SKILL.md", TINY_SKILL],
        ["plugin/skills/b/LICENSE.md", UPSTREAM_LICENCE],
      ]),
      ["plugin/skills/a", "plugin/skills/b"],
    );
    expect(outcome.output.refused).toEqual([]);
    expect(outcome.output.licenceFrom).toEqual(["plugin/LICENSE", "plugin/skills/b/LICENSE.md"]);
    const files = readSnapshotFiles(corpus, snapshot);
    expect([...files.keys()]).toEqual(["LICENSE", "a/SKILL.md", "b/LICENSE.md", "b/SKILL.md"]);
    expect(new TextDecoder().decode(files.get("LICENSE"))).toBe(UPSTREAM_LICENCE);
  });

  it("R2 refuses by name two entries whose nearest licences differ, and writes nothing", () => {
    const { corpus, manifest, outcome } = newSource(
      new Map([
        ["one/LICENSE", UPSTREAM_LICENCE],
        ["one/skills/a/SKILL.md", TINY_SKILL],
        ["two/LICENSE", OTHER_LICENCE],
        ["two/skills/b/SKILL.md", TINY_SKILL],
      ]),
      ["one/skills/a", "two/skills/b"],
    );
    expect(outcome.output.refused).toEqual([
      {
        skill: "*",
        issues: [
          {
            message:
              "the repository's root holds no licence file, and its entries' nearest licences differ: 'one/skills/a' takes 'one/LICENSE', 'two/skills/b' takes 'two/LICENSE'",
          },
        ],
      },
    ]);
    expect(readText(corpus, "manifest.json")).toBe(manifest);
    expect(existsSync(join(corpus, "upstream", "fixture-new"))).toBe(false);
  });

  it("R2 refuses by name an entry that finds no licence file above it", () => {
    const { outcome } = newSource(
      new Map([
        ["one/LICENSE", UPSTREAM_LICENCE],
        ["one/skills/a/SKILL.md", TINY_SKILL],
        ["two/skills/b/SKILL.md", TINY_SKILL],
      ]),
      ["one/skills/a", "two/skills/b"],
    );
    expect(outcome.output.refused).toEqual([
      {
        skill: "*",
        issues: [
          {
            message:
              "the repository's root holds no licence file, and none stands in 'two/skills/b' or a directory above it",
          },
        ],
      },
    ]);
  });

  it("R2 moves a pinned source whose new commit keeps its licence beside the entries, not at the root", () => {
    const later = new Map(NEXT_FILES);
    later.delete("LICENSE");
    later.set("skills/LICENSE", UPSTREAM_LICENCE);
    const { corpus, upstream } = corpusWithUpstream([later]);
    const third = upstream.commits[2] ?? "";
    const outcome = refreshVerb(corpus, request(third, { write: true }));
    expect(outcome.output.refused).toEqual([]);
    expect(outcome.output.licenceFrom).toEqual(["skills/LICENSE"]);
    const files = readSnapshotFiles(corpus, `upstream/${SOURCE}/${third}`);
    expect(new TextDecoder().decode(files.get("LICENSE"))).toBe(UPSTREAM_LICENCE);
  });

  it("R2 moves a pinned source whose old snapshot held no licence file to a commit that holds none either, its snapshot without LICENSE", () => {
    // A source whose copyright line the manifest states as `holder` has no licence file at any commit.
    const later = new Map(NEXT_FILES);
    later.delete("LICENSE");
    const { corpus, upstream } = corpusWithUpstream([later]);
    rmSync(join(corpus, "upstream", SOURCE, COMMIT, "LICENSE"));
    const third = upstream.commits[2] ?? "";
    const outcome = refreshVerb(corpus, request(third, { write: true }));
    expect(outcome.output.refused).toEqual([]);
    expect(outcome.output.licenceFrom).toEqual([]);
    expect(readSnapshotFiles(corpus, `upstream/${SOURCE}/${third}`).has("LICENSE")).toBe(false);
  });

  it("R2 refuses by name a pinned source whose old snapshot held a licence when its new commit holds none at the root or above", () => {
    const later = new Map(NEXT_FILES);
    later.delete("LICENSE");
    const { corpus, upstream } = corpusWithUpstream([later]);
    const manifest = readText(corpus, "manifest.json");
    const outcome = refreshVerb(corpus, request(upstream.commits[2] ?? "", { write: true }));
    expect(outcome.output.refused).toEqual([
      {
        skill: "*",
        issues: [
          {
            message:
              "the repository's root holds no licence file, and none stands in 'skills/fixture' or a directory above it",
          },
          {
            message:
              "the repository's root holds no licence file, and none stands in 'skills/tiny' or a directory above it",
          },
        ],
      },
    ]);
    expect(readText(corpus, "manifest.json")).toBe(manifest);
  });

  it("R2 names the root's licence file when the root holds one", () => {
    const { outcome } = newSource(
      new Map([
        ["LICENSE", UPSTREAM_LICENCE],
        ["skills/a/SKILL.md", TINY_SKILL],
      ]),
      ["skills/a"],
    );
    expect(outcome.output.licenceFrom).toEqual(["LICENSE"]);
    expect(outcome.output.links).toEqual([]);
  });
});

/** The first commit's files with one more skill directory beside them. */
const WITH_EXTRA: ReadonlyMap<string, string> = new Map([
  ...upstreamFiles(UPSTREAM_SKILL, UPSTREAM_SCRIPT),
  ["skills/extra/SKILL.md", TINY_SKILL],
  ["skills/extra/notes.md", UPSTREAM_NOTES],
]);

/** The fixture source pinned at a commit of its local repository that also holds `skills/extra`. */
function pinnedWithExtra() {
  const { corpus, upstream } = corpusWithUpstream([WITH_EXTRA]);
  const commit = upstream.commits[2] ?? "";
  const moved = refreshVerb(corpus, request(commit, { write: true }));
  if (moved.failed) throw new Error(JSON.stringify(moved.output.refused));
  return { corpus, upstream, commit, snapshot: `upstream/${SOURCE}/${commit}` };
}

describe("R3 a path added to a pinned source at its own commit", () => {
  it("R3 reports the entries without --write and writes nothing", () => {
    const { corpus, commit, snapshot } = pinnedWithExtra();
    const inventory = readText(corpus, `${snapshot}.inventory.json`);
    const outcome = refreshVerb(corpus, request(commit, { paths: ["skills/extra"] }));
    expect(outcome.failed).toBe(false);
    expect(outcome.output).toMatchObject({
      from: commit,
      to: commit,
      snapshot,
      entries: [...ENTRIES, { name: "extra", path: "skills/extra" }],
      gone: [],
      wrote: [],
      refused: [],
    });
    expect(readText(corpus, `${snapshot}.inventory.json`)).toBe(inventory);
    expect(existsSync(join(corpus, snapshot, "extra"))).toBe(false);
  });

  it("R3 with --write adds the entry's files and its inventory line, every held byte, the manifest and the recipes kept", () => {
    const { corpus, commit, snapshot } = pinnedWithExtra();
    const before = readSnapshotFiles(corpus, snapshot);
    const manifest = readText(corpus, "manifest.json");
    const recipe = readText(corpus, "recipes/fixture-skill.json");
    const outcome = refreshVerb(corpus, request(commit, { paths: ["skills/extra"], write: true }));
    expect(outcome.output.refused).toEqual([]);
    expect(outcome.output.wrote).toEqual([
      `corpus/${snapshot}/extra/`,
      `corpus/${snapshot}.inventory.json`,
    ]);
    expect(outcome.output.recipes).toMatchObject([
      { skill: "fixture-skill", markers: 0, rewrites: false },
    ]);
    const after = readSnapshotFiles(corpus, snapshot);
    for (const [path, bytes] of before)
      expect(sha256(after.get(path) ?? ""), path).toBe(sha256(bytes));
    expect([...after.keys()].filter((path) => !before.has(path))).toEqual([
      "extra/SKILL.md",
      "extra/notes.md",
    ]);
    expect(new TextDecoder().decode(after.get("extra/SKILL.md"))).toBe(TINY_SKILL);
    expect(JSON.parse(readText(corpus, `${snapshot}.inventory.json`))).toEqual({
      commit,
      files: [...after.keys()].map((path) => ({ path, sha256: sha256(after.get(path) ?? "") })),
      entries: [...ENTRIES, { name: "extra", path: "skills/extra" }],
    });
    expect(readText(corpus, "manifest.json")).toBe(manifest);
    expect(readText(corpus, "recipes/fixture-skill.json")).toBe(recipe);
    const again = refreshVerb(corpus, request(commit, { paths: ["skills/extra"], write: true }));
    expect(again.output).toMatchObject({ wrote: [], refused: [] });
  });

  it("R3 refuses a path the pinned commit does not hold, and writes nothing", () => {
    const { corpus, commit, snapshot } = pinnedWithExtra();
    const inventory = readText(corpus, `${snapshot}.inventory.json`);
    const outcome = refreshVerb(corpus, request(commit, { paths: ["skills/absent"], write: true }));
    expect(outcome.output.refused).toEqual([
      { skill: "*", issues: [{ message: "the commit holds no 'skills/absent'" }] },
    ]);
    expect(readText(corpus, `${snapshot}.inventory.json`)).toBe(inventory);
    expect(existsSync(join(corpus, snapshot, "absent"))).toBe(false);
  });

  it("R3 refuses by name a path whose nearest licence differs from the one the snapshot holds", () => {
    const { corpus, commit, snapshot } = newSource(
      new Map([
        ["one/LICENSE", UPSTREAM_LICENCE],
        ["one/skills/a/SKILL.md", TINY_SKILL],
        ["two/LICENSE", OTHER_LICENCE],
        ["two/skills/b/SKILL.md", TINY_SKILL],
      ]),
      ["one/skills/a"],
    );
    const outcome = refreshVerb(corpus, {
      ...request(commit, { write: true }),
      source: "fixture-new",
      paths: ["two/skills/b"],
    });
    expect(outcome.output.refused).toEqual([
      {
        skill: "*",
        issues: [
          {
            message:
              "the repository's root holds no licence file, and its entries' nearest licences differ: 'one/skills/a' takes 'one/LICENSE', 'two/skills/b' takes 'two/LICENSE'",
          },
        ],
      },
    ]);
    expect(existsSync(join(corpus, snapshot, "b"))).toBe(false);
  });

  it("R3 refuses, without --write as with it, a held file whose bytes the commit does not give, and writes nothing", () => {
    const { corpus, commit, snapshot } = pinnedWithExtra();
    writeFileSync(join(corpus, snapshot, "tiny", "SKILL.md"), "# Tiny, edited by hand\n");
    const inventory = readText(corpus, `${snapshot}.inventory.json`);
    const message = `a snapshot is immutable, and the commit holds other bytes than its 'tiny/SKILL.md'`;
    for (const write of [false, true]) {
      const outcome = refreshVerb(corpus, request(commit, { paths: ["skills/extra"], write }));
      expect(outcome.failed).toBe(true);
      expect(outcome.output.refused).toEqual([{ skill: "*", issues: [{ message }] }]);
      expect(outcome.output.wrote).toEqual([]);
    }
    expect(readText(corpus, `${snapshot}.inventory.json`)).toBe(inventory);
    expect(existsSync(join(corpus, snapshot, "extra"))).toBe(false);
  });

  it("R3 refuses, without --write as with it, a licence the snapshot never held, and writes nothing", () => {
    const { corpus, commit, snapshot } = pinnedWithExtra();
    unlinkSync(join(corpus, snapshot, "LICENSE"));
    const message =
      "adding entries at the pinned commit would add 'LICENSE' beside them, which a refresh to a new commit takes";
    for (const write of [false, true]) {
      const outcome = refreshVerb(corpus, request(commit, { paths: ["skills/extra"], write }));
      expect(outcome.failed).toBe(true);
      expect(outcome.output.refused).toEqual([{ skill: "*", issues: [{ message }] }]);
    }
    expect(existsSync(join(corpus, snapshot, "LICENSE"))).toBe(false);
    expect(existsSync(join(corpus, snapshot, "extra"))).toBe(false);
  });

  it("R3 refuses a write that fails partway with the files already written, the inventory as it stood", () => {
    const { corpus, upstream } = corpusWithUpstream([
      new Map([...WITH_EXTRA, ["skills/alpha/SKILL.md", TINY_SKILL]]),
    ]);
    const commit = upstream.commits[2] ?? "";
    if (refreshVerb(corpus, request(commit, { write: true })).failed)
      throw new Error("the fixture source did not move to its third commit");
    const snapshot = `upstream/${SOURCE}/${commit}`;
    const inventory = readText(corpus, `${snapshot}.inventory.json`);
    const locked = join(corpus, snapshot, "extra");
    mkdirSync(locked);
    chmodSync(locked, 0o500);
    try {
      const outcome = refreshVerb(
        corpus,
        request(commit, { paths: ["skills/alpha", "skills/extra"], write: true }),
      );
      expect(outcome.failed).toBe(true);
      expect(outcome.output.wrote).toEqual([`corpus/${snapshot}/alpha/SKILL.md`]);
      expect(JSON.stringify(outcome.output.refused)).toContain(
        "1 of its 3 new files were written, and the inventory is as it stood",
      );
      expect(readText(corpus, `${snapshot}.inventory.json`)).toBe(inventory);
    } finally {
      chmodSync(locked, 0o700);
    }
  });
});

describe("R2 symbolic links at a refreshed path", () => {
  const FILES = new Map([
    ["LICENSE", UPSTREAM_LICENCE],
    ["shared/notes.md", UPSTREAM_NOTES],
    ["shared/more/deep.md", UPSTREAM_NOTES],
    ["skills/a/SKILL.md", TINY_SKILL],
  ]);

  it("R2 holds a relative link that resolves inside the tree to a regular file as its target's bytes, and lists it", () => {
    const { corpus, outcome, snapshot } = newSource(
      FILES,
      ["skills/a"],
      new Map([["skills/a/notes.md", { link: "../../shared/notes.md" }]]),
    );
    expect(outcome.output.refused).toEqual([]);
    expect(outcome.output.links).toEqual([
      { path: "skills/a/notes.md", target: "shared/notes.md" },
    ]);
    const files = readSnapshotFiles(corpus, snapshot);
    expect(new TextDecoder().decode(files.get("a/notes.md"))).toBe(UPSTREAM_NOTES);
    // SAFETY: the inventory the refresh just wrote; the test reads its file list only.
    const inventory = JSON.parse(readText(corpus, `${snapshot}.inventory.json`)) as {
      files: { path: string; sha256: string }[];
    };
    expect(inventory.files).toContainEqual({ path: "a/notes.md", sha256: sha256(UPSTREAM_NOTES) });
  });

  it("R2 refuses by name a loop of links, which ends at no file", () => {
    const { corpus, commit, manifest, outcome } = newSource(
      FILES,
      ["skills/a"],
      new Map([
        ["skills/a/notes.md", { link: "../../shared/one.md" }],
        ["shared/one.md", { link: "two.md" }],
        ["shared/two.md", { link: "one.md" }],
      ]),
    );
    expect(outcome.output.refused).toEqual([
      {
        skill: "*",
        issues: [
          {
            message: `'skills/a/notes.md' at ${commit} is a symbolic link through more than 8 links, which a snapshot does not hold`,
          },
        ],
      },
    ]);
    expect(readText(corpus, "manifest.json")).toBe(manifest);
  });

  it("R2 follows a link to a link to the regular file it ends at", () => {
    const { outcome } = newSource(
      FILES,
      ["skills/a"],
      new Map([
        ["skills/a/notes.md", { link: "../../shared/alias.md" }],
        ["shared/alias.md", { link: "notes.md" }],
      ]),
    );
    expect(outcome.output.refused).toEqual([]);
    expect(outcome.output.links).toEqual([
      { path: "skills/a/notes.md", target: "shared/notes.md" },
    ]);
  });

  it.each([
    [
      "an absolute link",
      { link: "/etc/hosts" },
      "skills/a/notes.md",
      "is a symbolic link to the absolute path '/etc/hosts'",
    ],
    [
      "a link that leaves the tree",
      { link: "../../../outside.md" },
      "skills/a/notes.md",
      "is a symbolic link to '../../../outside.md', outside the repository",
    ],
    [
      "a link to a directory",
      { link: "../../shared/more" },
      "skills/a/more",
      "is a symbolic link to the directory 'shared/more'",
    ],
    [
      "a link to nothing",
      { link: "missing.md" },
      "skills/a/notes.md",
      "is a symbolic link to 'skills/a/missing.md', a path the commit does not hold",
    ],
    ["a submodule", { submodule: "1".repeat(40) }, "skills/a/sub", "is a submodule"],
  ] as const)("R2 refuses %s by name, and writes nothing", (_kind, entry, at, why) => {
    const { corpus, commit, manifest, outcome } = newSource(
      FILES,
      ["skills/a"],
      new Map<string, TreeEntry>([[at, entry]]),
    );
    expect(outcome.output.refused).toEqual([
      {
        skill: "*",
        issues: [{ message: `'${at}' at ${commit} ${why}, which a snapshot does not hold` }],
      },
    ]);
    expect(readText(corpus, "manifest.json")).toBe(manifest);
  });
});

/** The fixture recipe re-anchored to a commit, as `refresh --write` writes it. */
function reanchoredOnDisk(commit: string): string {
  const parsed = parseRecipe(fixtureText(), "fixture");
  if (parsed._tag === "err") throw parsed.error;
  const checked = checkRecipe(parsed.value, fixtureSnapshots);
  if (checked._tag === "err") throw checked.error;
  return reanchor({
    checked: checked.value,
    text: fixtureText(),
    source,
    commit,
    before: held(OLD_SNAPSHOT),
    after: held(NEXT_SNAPSHOT),
  }).text;
}

describe("scripts/corpus.mjs refresh in this tree", () => {
  function run(...args: string[]) {
    const result = spawnSync(process.execPath, ["scripts/corpus.mjs", ...args], {
      cwd: repository,
      encoding: "utf8",
    });
    return { status: result.status, output: parseJson(result.stdout) };
  }

  it("at a source's pinned commit is a no-op report: every recipe re-anchors to its own bytes, nothing is fetched or written", () => {
    const text = readFileSync(join(repository, "corpus", "manifest.json"), "utf8");
    const manifest = parseCorpusManifest(text, "corpus/manifest.json");
    if (manifest._tag === "err") throw manifest.error;
    const pinned = manifest.value.sources.find((entry) => entry.name === "mattpocock-skills");
    const result = run("refresh", "mattpocock-skills", "--commit", pinned?.commit ?? "");
    expect(result.status).toBe(0);
    expect(result.output).toMatchObject({
      from: pinned?.commit,
      to: pinned?.commit,
      wrote: [],
      refused: [],
    });
    // SAFETY: the report printed by the verb under test; the assertions read its recipes only.
    const recipes = (
      result.output as { recipes: { markers: number; rewrites: boolean; changed: unknown[] }[] }
    ).recipes;
    expect(recipes.length).toBeGreaterThanOrEqual(10);
    for (const recipe of recipes)
      expect(recipe).toMatchObject({ markers: 0, rewrites: false, changed: [] });
    expect(readFileSync(join(repository, "corpus", "manifest.json"), "utf8")).toBe(text);
  });

  it("refuses a refresh with no commit named, fetching nothing", () => {
    const result = run("refresh", "mattpocock-skills", "--write");
    expect(result.status).toBe(1);
    expect(result.output).toMatchObject({ verb: "refresh" });
  });
});
