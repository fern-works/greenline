/** A tree without the chain's records builds from the ledger's views (workshop/components/public-export.md): the pins, the provenance pages and the index. */
import { describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyLedgerOrViews } from "../../src/shell/ledger.ts";

/** The views a public tree carries: the manifest, the index and one provenance page per vendored copy; no records. */
function viewsOnly(): string {
  const root = mkdtempSync(join(tmpdir(), "greenline-views-"));
  const corpus = join(root, "corpus");
  mkdirSync(join(corpus, "ledger"), { recursive: true });
  cpSync("corpus/manifest.json", join(corpus, "manifest.json"));
  cpSync("corpus/ledger/INDEX.md", join(corpus, "ledger/INDEX.md"));
  const manifest = JSON.parse(readFileSync("corpus/manifest.json", "utf8"));
  for (const skill of manifest.skills) {
    if (skill.upstream === undefined) continue;
    mkdirSync(join(corpus, "skills", skill.name), { recursive: true });
    cpSync(
      join("corpus/skills", skill.name, "PROVENANCE.md"),
      join(corpus, "skills", skill.name, "PROVENANCE.md"),
    );
  }
  return root;
}

describe("verifyLedgerOrViews", () => {
  it("accepts a tree that carries the views and no records, with an empty chain", () => {
    const root = viewsOnly();
    try {
      const verified = verifyLedgerOrViews(join(root, "corpus"));
      expect(verified._tag === "ok" && verified.value.length).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("refuses a vendored copy without its provenance page, and one without a pin", () => {
    const root = viewsOnly();
    try {
      const corpus = join(root, "corpus");
      const manifest = JSON.parse(readFileSync(join(corpus, "manifest.json"), "utf8"));
      const vendored = manifest.skills.find(
        (skill: { upstream?: unknown }) => skill.upstream !== undefined,
      );
      rmSync(join(corpus, "skills", vendored.name, "PROVENANCE.md"));
      const noPage = verifyLedgerOrViews(corpus);
      expect(noPage._tag === "err" && noPage.error.issues[0]?.message).toContain(
        "provenance page is absent",
      );
      cpSync(
        join("corpus/skills", vendored.name, "PROVENANCE.md"),
        join(corpus, "skills", vendored.name, "PROVENANCE.md"),
      );
      delete vendored.ledger;
      writeFileSync(join(corpus, "manifest.json"), JSON.stringify(manifest, null, 2));
      const noPin = verifyLedgerOrViews(corpus);
      expect(noPin._tag === "err" && noPin.error.issues[0]?.message).toContain(
        "without a ledger pin",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
