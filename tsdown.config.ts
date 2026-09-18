import { readFileSync } from "node:fs";

import type { UserConfig } from "tsdown";

const packageBody = readFileSync(new URL("./package.json", import.meta.url), "utf8");
const version = /"version"\s*:\s*"([^"]+)"/u.exec(packageBody)?.[1];

if (version === undefined) {
  throw new Error("package.json must declare the CLI version");
}

const VERSION_DEFINITION = {
  __GREEN_LINE_VERSION__: JSON.stringify(version),
};

const config: UserConfig = {
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

export default config;
