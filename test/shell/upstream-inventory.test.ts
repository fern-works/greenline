import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { createHash } from "node:crypto";
import { parseCorpusManifest } from "../../src/core/corpus.ts";

const repoRoot = join(import.meta.dirname, "..", "..");
const corpusRoot = join(repoRoot, "corpus");

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

describe("upstream snapshot byte-equivalence (every pinned family)", () => {
  const manifestResult = parseCorpusManifest(
    readFileSync(join(corpusRoot, "manifest.json"), "utf8"),
    "corpus/manifest.json",
  );
  expect(manifestResult._tag).toBe("ok");
  if (manifestResult._tag !== "ok") return;
  const manifest = manifestResult.value;

  for (const family of manifest.upstreams) {
    // SAFETY: the inventory is repo-owned generated JSON with a known shape;
    // the tests below re-derive every value from the snapshot itself.
    const inventory = JSON.parse(
      readFileSync(`${join(corpusRoot, family.snapshot)}.inventory.json`, "utf8"),
    ) as { commit: string; files: readonly { path: string; sha256: string }[] };
    const snapshotRoot = join(corpusRoot, family.snapshot);

    it(`${family.name}: inventory records the pinned commit`, () => {
      expect(inventory.commit).toBe(family.commit);
    });

    it(`${family.name}: covers exactly the files present in the snapshot`, () => {
      expect(inventory.files.map((file) => file.path)).toEqual(walk(snapshotRoot));
    });

    it(`${family.name}: every vendored file hashes to its recorded pin`, () => {
      for (const file of inventory.files) {
        const content = readFileSync(join(snapshotRoot, file.path), "utf8");
        const sha = createHash("sha256").update(content, "utf8").digest("hex");
        expect(sha, `${file.path} diverges from the pinned snapshot`).toBe(file.sha256);
      }
    });
  }
});
