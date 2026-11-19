import { copyFileSync, readFileSync } from "node:fs";

import type { UserConfig } from "tsdown";

const packageBody = readFileSync(new URL("./package.json", import.meta.url), "utf8");
const version = /"version"\s*:\s*"([^"]+)"/u.exec(packageBody)?.[1];

if (version === undefined) {
  throw new Error("package.json must declare the CLI version");
}

const VERSION_DEFINITION = {
  __GREEN_LINE_VERSION__: JSON.stringify(version),
};

/** The CLI: the one executable bundle. */
const cli: UserConfig = {
  entry: { greenline: "src/shell/cli/entry.ts" },
  outDir: "dist/bin",
  format: "esm",
  platform: "node",
  target: "node22",
  fixedExtension: true,
  clean: true,
  dts: false,
  hooks: {
    "build:before": ({ buildOptions }) => {
      buildOptions.transform = {
        ...buildOptions.transform,
        define: {
          ...buildOptions.transform?.define,
          ...VERSION_DEFINITION,
        },
      };
      Reflect.deleteProperty(buildOptions, "define");
      Reflect.deleteProperty(buildOptions, "inject");
    },
  },
};

/**
 * The inspector's client app: Preact and TypeScript bundled into one
 * browser module beside the CLI, which `greenline inspect` serves. Preact
 * is a build-time dependency bundled here, never a runtime dependency of
 * the package; its MIT licence ships beside the bundle. tsdown cleans the
 * output directory once for both builds, before either writes.
 */
const client: UserConfig = {
  entry: { inspector: "src/shell/inspect/app/main.ts" },
  outDir: "dist/bin",
  format: "esm",
  platform: "browser",
  target: "es2022",
  fixedExtension: true,
  clean: true,
  dts: false,
  minify: true,
  noExternal: [/^preact/u],
  hooks: {
    "build:before": ({ buildOptions }) => {
      Reflect.deleteProperty(buildOptions, "define");
      Reflect.deleteProperty(buildOptions, "inject");
    },
    "build:done": () => {
      copyFileSync("assets/inspector/preact-LICENSE.txt", "dist/bin/inspector-preact-LICENSE.txt");
    },
  },
};

/**
 * The readers module, `greenline/readers` (J-150 S2; docs/SPEC.md, "The
 * readers module"): the readers of the agent's text as their own entry, a
 * Node module with its types, which the package's `exports` names. Its
 * dependencies stay the package's own, never bundled in.
 */
const readers: UserConfig = {
  entry: { readers: "src/readers/index.ts" },
  outDir: "dist/readers",
  format: "esm",
  platform: "node",
  target: "node22",
  fixedExtension: true,
  clean: true,
  // The types are the compiler's: this tsdown reads the isolated-declarations emit in a form the installed oxc no longer returns.
  dts: { isolatedDeclarations: false },
  // The types land as one file beside the module, `readers.d.mts`, never under a content hash, so `exports` can name it.
  outputOptions: {
    chunkFileNames: (chunk) => (chunk.name === "readers.d" ? "readers.d.mts" : "[name]-[hash].mjs"),
  },
  hooks: {
    "build:before": ({ buildOptions }) => {
      Reflect.deleteProperty(buildOptions, "define");
      Reflect.deleteProperty(buildOptions, "inject");
    },
  },
};

const configs: UserConfig[] = [cli, client, readers];

export default configs;
