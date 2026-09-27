// Rebuild the committed projection exemplars after an intentional contract change:
// the default workspace, garden disabled, whole under test/goldens/corpus/, and
// what enabling garden adds or changes, under test/goldens/garden-enabled/.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fixtureConfiguration, gardenEnabledConfiguration } from "../test/fixtures/corpus.ts";
import { compileInstallation } from "../src/shell/installation.ts";
import { renderProjection } from "../src/core/render.ts";
import { goldenPath, gardenDelta } from "./lib/golden-path.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const release = compileInstallation(join(root, "corpus"));
if (release._tag === "err") throw release.error;
const disabled = renderProjection(fixtureConfiguration, release.value);
const enabled = renderProjection(gardenEnabledConfiguration, release.value);
const delta = gardenDelta(disabled, enabled);

/** Replace one golden directory with these files. */
function writeTree(directory, files) {
  rmSync(directory, { recursive: true, force: true });
  for (const file of files) {
    const path = join(directory, goldenPath(file.path));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.content);
  }
}
writeTree(join(root, "test/goldens/corpus"), disabled);
writeTree(join(root, "test/goldens/garden-enabled"), delta);
console.log(
  `Wrote ${disabled.length} golden files to test/goldens/corpus and ${delta.length} to test/goldens/garden-enabled.`,
);
