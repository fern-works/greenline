import { fixtureConfiguration } from "../fixtures/corpus.ts";
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { compileInstallation } from "../../src/shell/installation.ts";
import { renderProjection } from "../../src/core/render.ts";
import { findBrokenReferences } from "../../src/core/links.ts";
// @ts-expect-error plain-mjs gate helper shares the path mapping (audit 4, R1)
import { goldenPath } from "../../scripts/lib/golden-path.mjs";

const repoRoot = join(import.meta.dirname, "..", "..");

const goldenRoot = join(repoRoot, "test", "goldens", "corpus");

function walk(root: string): readonly string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) visit(full);
      else
        out.push(
          full
            .slice(root.length + 1)
            .split(sep)
            .join("/"),
        );
    }
  };
  visit(root);
  return out;
}

describe("full-corpus golden projection", () => {
  const release = compileInstallation(join(repoRoot, "corpus"));
  if (release._tag === "err") throw release.error;
  const manifest = {
    ...fixtureConfiguration,
  };
  const projection = renderProjection(manifest, release.value);

  it("matches the committed golden tree exactly (both targets)", () => {
    // Flat-sort both sides: the projection sorts full path strings while
    // the walk sorts per directory, and the two orders diverge when one
    // sibling name prefixes another (ponytail / ponytail-review).
    const flat = (paths: readonly string[]): readonly string[] => [...paths].sort();
    expect(flat(projection.map((file) => goldenPath(file.path)))).toEqual(flat(walk(goldenRoot)));
    for (const file of projection) {
      const golden = readFileSync(join(goldenRoot, goldenPath(file.path)), "utf8");
      expect(golden, `${file.path} diverges from the golden`).toBe(file.content);
    }
  });

  it("renders no broken same-directory references", () => {
    // `-template.md` support files are skeletons for the repo their skill
    // generates (product-description); their relative links resolve in
    // that built repo, never inside the projection.
    const skillFiles = projection.filter(
      (file) =>
        (file.path.startsWith(".agents/skills/") || file.path.startsWith(".claude/skills/")) &&
        !file.path.endsWith("-template.md"),
    );
    expect(findBrokenReferences(skillFiles)).toEqual([]);
  });
});
