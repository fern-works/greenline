// Rebuild the one committed projection exemplar after an intentional contract change.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fixtureConfiguration } from "../test/fixtures/corpus.ts";
import { compileInstallation } from "../src/shell/installation.ts";
import { renderProjection } from "../src/core/render.ts";
import { goldenPath } from "./lib/golden-path.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const release = compileInstallation(join(root, "corpus"));
if (release._tag === "err") throw release.error;
const manifest = {
  ...fixtureConfiguration,
};
const projection = renderProjection(manifest, release.value);
const directory = join(root, "test/goldens/corpus");
rmSync(directory, { recursive: true, force: true });
for (const file of projection) {
  const path = join(directory, goldenPath(file.path));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, file.content);
}
console.log(`Wrote ${projection.length} golden files to test/goldens/corpus.`);
