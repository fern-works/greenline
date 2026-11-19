/** The suite's two projects (J-127 S2; docs/CODE-STANDARDS.md, "Testing"): the
 * slow tests, named in vitest.config.ts, form the `slow` project only when the
 * run sets GREENLINE_SLOW_TESTS=1, as the full check's vitest row does; any
 * other run, a focused proof's among them, holds the `fast` project alone.
 * Each test starts one `vitest list` child, a few seconds, since only the
 * runner's own collection shows which project holds a file; it builds no
 * repository, tarball or tree, so it stays in `fast`. */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SLOW } from "../../vitest.config.ts";

/** The test files one `vitest list` run collects, each with its project. */
const listed = (env: NodeJS.ProcessEnv) => {
  const run = spawnSync("pnpm", ["exec", "vitest", "list", "--filesOnly"], {
    encoding: "utf8",
    env,
  });
  expect(run.status, run.stderr).toBe(0);
  return run.stdout
    .split("\n")
    .map((line) => /^\[(fast|slow)\] (\S+)$/.exec(line.trim()))
    .flatMap((match) => (match ? [{ project: match[1], file: match[2] }] : []));
};

describe("the fast and slow projects", () => {
  it("J-127 S2 holds the fast project alone without GREENLINE_SLOW_TESTS, none of the slow tests in it", () => {
    const files = listed({ ...process.env, GREENLINE_SLOW_TESTS: undefined });
    expect(files.length).toBeGreaterThan(100);
    expect(files.filter((item) => item.project !== "fast")).toEqual([]);
    expect(files.filter((item) => SLOW.includes(item.file ?? ""))).toEqual([]);
  }, 60_000);

  it("J-127 S2 adds the slow project with GREENLINE_SLOW_TESTS=1, each slow test there and nowhere else", () => {
    const files = listed({ ...process.env, GREENLINE_SLOW_TESTS: "1" });
    const present = SLOW.filter((file) => existsSync(file)).sort();
    expect(present.length).toBeGreaterThan(0);
    expect(
      files
        .filter((item) => item.project === "slow")
        .map((item) => item.file)
        .sort(),
    ).toEqual(present);
    expect(
      files.filter((item) => item.project === "fast" && SLOW.includes(item.file ?? "")),
    ).toEqual([]);
  }, 60_000);
});
