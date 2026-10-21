/**
 * The corpus side of the spawn and network inventories. The product's
 * inventories (`test/connectors/p5.test.ts`) leave `src/corpus/` out, since
 * the workshop's recipe code never runs in a workspace; this file holds the
 * corpus to its own account (`workshop/components/recipes.md`): one module,
 * `src/corpus/tree.ts`, starts a program, `git` for `refresh`, and no module
 * imports a network module, the fetch being git's alone.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CORPUS = join(import.meta.dirname, "..", "..", "src", "corpus");

/** Every source file under `src/corpus/`, with its text. */
function corpusSources(): readonly (readonly [string, string])[] {
  const found: [string, string][] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(join(CORPUS, directory), { withFileTypes: true })) {
      const path = directory === "" ? entry.name : `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|mts|mjs|js)$/.test(entry.name))
        found.push([`src/corpus/${path}`, readFileSync(join(CORPUS, path), "utf8")]);
    }
  };
  walk("");
  return found;
}

/** The module specifiers a source imports or re-exports, statically or dynamically. */
function importsOf(text: string): readonly string[] {
  return [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm)].map(
    (match) => match[1] ?? "",
  );
}

const NETWORK = new Set([
  "http",
  "https",
  "http2",
  "net",
  "tls",
  "dns",
  "dgram",
  "undici",
  "node-fetch",
  "axios",
  "ws",
]);

/** A source's code without its block comments and its whole-line comments, so a word in prose is not read as a call. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Whether a specifier names a network module, with or without the `node:` scheme. */
function isNetwork(specifier: string): boolean {
  return NETWORK.has(specifier.replace(/^node:/, ""));
}

describe("R2 the corpus's imports", () => {
  it("R2 only src/corpus/tree.ts imports node:child_process, and it takes spawnSync alone, by name", () => {
    const all = corpusSources();
    expect(all.length).toBeGreaterThan(10);
    expect(
      all
        .filter(([, text]) =>
          importsOf(text).some((s) => s.replace(/^node:/, "") === "child_process"),
        )
        .map(([path]) => path),
    ).toEqual(["src/corpus/tree.ts"]);
    const tree = all.find(([path]) => path === "src/corpus/tree.ts")?.[1] ?? "";
    expect(
      [...tree.matchAll(/import\s*([^;]*?)\s*from\s*["'](?:node:)?child_process["']/g)].map(
        (match) => (match[1] ?? "").replace(/\s+/g, " ").trim(),
      ),
    ).toEqual(["{ spawnSync }"]);
  });

  it("R2 no file under src/corpus/ imports a network module, and none reaches a module without a static import", () => {
    const all = corpusSources();
    expect(
      all.flatMap(([path, text]) =>
        importsOf(text)
          .filter(isNetwork)
          .map((specifier) => `${path}: ${specifier}`),
      ),
    ).toEqual([]);
    expect(
      all
        .filter(([, text]) =>
          /getBuiltinModule|createRequire|\brequire\s*\(|\bimport\s*\(|\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/.test(
            codeOf(text),
          ),
        )
        .map(([path]) => path),
    ).toEqual([]);
  });
});
