import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { fixtureCorpus, fixtureRecipe, type FixturePassage } from "../fixtures/recipe.ts";

/**
 * The fronts row (`corpus-fronts` in scripts/check.mjs, J-93 S2): a skill's
 * front holds the upstream prose alone and a step's skill names its
 * references page, so a later ingestion cannot put a mechanic back in a
 * front.
 */
const GREENLINE = fileURLToPath(new URL("../..", import.meta.url));
const scratch: string[] = [];

const written = (text: string): FixturePassage => ({
  passage: "written",
  text,
  kind: "home",
  reason: "the fixture's mechanics",
});

/** A checkout holding the gate's scripts and the fixture corpus, its step's skill split as given. */
const fixture = (front: string | undefined) => {
  const root = mkdtempSync(join(tmpdir(), "greenline-fronts-row-"));
  scratch.push(root);
  cpSync(join(GREENLINE, "scripts"), join(root, "scripts"), {
    recursive: true,
    filter: (source) => !source.endsWith(join("lib", "qa-storage.mjs")),
  });
  for (const shared of ["node_modules", "src"])
    symlinkSync(join(GREENLINE, shared), join(root, shared), "dir");
  const recipe = fixtureRecipe();
  if (front !== undefined) recipe.files[0]?.passages.push(written(front));
  // `Object.assign` adds the part the fixture's type leaves out.
  recipe.files.push(
    Object.assign(
      {
        path: "references/greenline.md",
        passages: [written("Run `greenline check` on every check.")],
      },
      { part: "references" },
    ),
  );
  for (const [path, text] of fixtureCorpus(recipe)) {
    mkdirSync(dirname(join(root, "corpus", path)), { recursive: true });
    writeFileSync(join(root, "corpus", path), text);
  }
  mkdirSync(join(root, "corpus/runtime"), { recursive: true });
  copyFileSync(
    join(GREENLINE, "corpus/runtime/modes.json"),
    join(root, "corpus/runtime/modes.json"),
  );
  return root;
};
const runRow = (root: string) =>
  spawnSync(process.execPath, ["scripts/check.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CHECK_ROWS: "corpus-fronts" },
  });
// The gate's summary separates a row's status from its reason with this
// character; the ruled words keep it out of the bytes written here.
const SEPARATOR = String.fromCodePoint(0x2014);
const summary = (stdout: string) =>
  stdout
    .split("\n")
    .find((line) => line.startsWith("corpus-fronts"))
    ?.replace(/\s+/gu, " ");

afterEach(() => {
  for (const root of scratch.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("J-93 S2 the fronts row", () => {
  it("refuses a mechanic put back in a front, naming the skill, the file, the line and what it is", () => {
    const run = runRow(fixture("Run `greenline status` first."));
    expect(summary(run.stdout), run.stdout + run.stderr).toBe(
      `corpus-fronts FAIL ${SEPARATOR} corpus-fronts refused 1: fixture-skill SKILL.md:16: a greenline command, greenline status`,
    );
    expect(run.status).toBe(1);
  });

  it("passes a front of upstream prose beside its references page", () => {
    const run = runRow(fixture(undefined));
    expect(summary(run.stdout), run.stdout + run.stderr).toBe("corpus-fronts PASS");
    expect(run.status).toBe(0);
  });
});
