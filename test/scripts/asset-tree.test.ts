import { describe, expect, it } from "vitest";
// @ts-expect-error plain-mjs gate helper of the corpus-optin-assets row
import { ASSET_TREE_MIN, assetTreeIssues } from "../../scripts/lib/asset-tree.mjs";

const directory =
  (assets: readonly string[], onlySkill = false) =>
  () => ({ assets, onlySkill });

describe("S17 the asset-tree rule of the corpus-optin-assets row", () => {
  it("S17 counts three files that are not Markdown as an asset tree", () => {
    expect(ASSET_TREE_MIN).toBe(3);
  });

  it("S17 lets a default skill carry a script or two", () => {
    expect(
      assetTreeIssues([{ name: "diagnose" }], directory(["scripts/a.sh", "references/b.sh"])),
    ).toEqual([]);
  });

  it("S17 refuses a default skill with an asset tree of three files", () => {
    expect(assetTreeIssues([{ name: "viewer" }], directory(["a.js", "b.js", "c.css"]))).toEqual([
      "viewer ships an asset tree (3 files) without extra",
    ]);
  });

  it("S17 takes an extra with its tree, and refuses an extra with nothing beside its SKILL.md", () => {
    expect(assetTreeIssues([{ name: "map", extra: true }], directory(["a", "b", "c"]))).toEqual([]);
    expect(assetTreeIssues([{ name: "map", extra: true }], directory([], true))).toEqual([
      "map is extra but carries no file beside its SKILL.md",
    ]);
  });
});
