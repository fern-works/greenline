import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startInspector, type InspectorHandle } from "../../../src/shell/inspect/server.ts";
import { homesWorkspace } from "./homes-fixture.ts";

/**
 * The page as one document: one row of views, the same components and
 * tokens on every view, and the installation view's declared checks and
 * hooks as the manifest and the clone hold them.
 */

let root = "";
let url = "";
let handle: InspectorHandle | undefined;

beforeAll(async () => {
  const workspace = homesWorkspace();
  root = workspace.root;
  const path = join(root, ".greenline/manifest.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  manifest.checks = [{ name: "test", command: "npm test", dir: "." }];
  manifest.hooks = { git: false, adapters: true };
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  handle = await startInspector(root, workspace.env, 0);
  url = handle.url;
});

afterAll(async () => {
  await handle?.close();
  rmSync(root, { recursive: true, force: true });
});

describe("the inspector's page", () => {
  it("S2 holds every view in one row of navigation, the record views first, with no deeper menu", async () => {
    const page = await (await fetch(url)).text();
    const nav = page.slice(page.indexOf('<nav class="views"'), page.indexOf("</nav>") + 6);
    expect(
      [...nav.matchAll(/<a href="#([a-z]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]),
    ).toEqual([
      ["changes", "Changes"],
      ["plans", "Plans"],
      ["knowledge", "Knowledge"],
      ["overview", "Checks"],
      ["evidence", "Receipts"],
      ["policy", "Repository policy"],
      ["installation", "Installation"],
    ]);
    expect(nav).not.toContain('<ul class="sub');
    for (const view of ["plans", "plan", "knowledge", "home"])
      expect(page).toContain(`<section data-view="${view}"`);
  });

  it("S2 stays one local page: no script, style, font or link reaches another host", async () => {
    const page = await (await fetch(url)).text();
    expect(page).not.toMatch(/(src|href)="(https?:)?\/\//);
    expect(page).not.toMatch(/url\((?!data:)/);
    expect(page).not.toMatch(/https?:\/\/(?!127\.0\.0\.1)[a-z]/);
  });

  it("S2 keeps the house style's three sizes, its radius and no shadow", async () => {
    const page = await (await fetch(url)).text();
    expect(page).toContain("--body: 17px; --secondary: 14px; --meta: 13px; --radius: 6px;");
    expect(page).not.toMatch(/box-shadow:\s*(?!none)/);
    expect(page).toContain("@media (prefers-color-scheme: dark)");
  });

  it("S2 carries the declared checks and the hooks' registration as the manifest and the clone hold them", async () => {
    const state = await (await fetch(`${url}api/state`)).json();
    expect(state.hooks).toEqual({
      settings: { git: false, adapters: true },
      git: { state: "off" },
      checks: [{ name: "test", command: "npm test", dir: "." }],
      adapters: expect.any(Array),
    });
    const page = await (await fetch(url)).text();
    expect(page).toContain("<h2>Declared checks</h2>");
    expect(page).toContain("<h2>Hooks</h2>");
  });
});
