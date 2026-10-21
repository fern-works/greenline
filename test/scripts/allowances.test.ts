import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { listFilesRecursive } from "../../src/shell/fs/walk.ts";

/**
 * The re-cut's allowances end with it (S20 of the plan modes-records-recipes):
 * no check excuses a page not yet re-cut.
 */

const repository = join(import.meta.dirname, "..", "..");
const ALLOWANCES = /before-the-recut|BEFORE_THE_RECUT|beforeTheRecut|PLAN_DIRECTORY/;

it("S20 the allowance module is gone and no check, test or export rule reads one", () => {
  // The module the re-cut read, named by its parts: the public tree carries no such script.
  expect(existsSync(join(repository, "scripts", "lib", "before-the-recut.mjs"))).toBe(false);
  const readers = ["scripts", "test"]
    .flatMap((directory) =>
      listFilesRecursive(join(repository, directory)).map((path) => `${directory}/${path}`),
    )
    .filter((path) => /\.(?:mjs|ts|json)$/.test(path) && !path.endsWith("allowances.test.ts"))
    .filter((path) => ALLOWANCES.test(readFileSync(join(repository, path), "utf8")));
  expect(readers).toEqual([]);
});
