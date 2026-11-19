import { defineConfig, type ViteUserConfig } from "vitest/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const privateSetup = resolve("test/scripts/qa-storage-setup.ts");

/**
 * The slow tests (J-127 S2), each by name: the tests that build a
 * repository, a tarball or a tree, real git hooks and worktrees, the export
 * and the public tree, and the workshop's storage. They form the `slow`
 * project, which only a run with GREENLINE_SLOW_TESTS=1 holds: the full
 * check's vitest row and the public gate's set it, so a focused proof, or any
 * other run, runs the `fast` project alone (docs/CODE-STANDARDS.md, "Testing").
 */
export const SLOW: string[] = [
  "test/shell/git-hooks.test.ts",
  "test/cli/event.test.ts",
  "test/cli/tidy.test.ts",
  "test/shell/code-tree.test.ts",
  "test/scripts/export-command.test.ts",
  "test/scripts/public-tree.test.ts",
  "test/scripts/site-inputs.test.ts",
  "test/scripts/qa-storage.test.ts",
  "test/scripts/fixtures.test.ts",
  "test/shell/inspect/linear-workspace.test.ts",
];
const slow = process.env["GREENLINE_SLOW_TESTS"] === "1";

// Vendored anti-slop rules stay tested in our suite; their RuleTester
// assertions run at import and register no vitest suites, hence
// passWithNoTests.
const ALL = ["test/**/*.test.ts", "tools/oxlint/anti-slop/rules/*.test.ts"];
const TIMEOUT = 30_000;

const config: ViteUserConfig = defineConfig({
  test: {
    // The root's own include names every test file for the tools that read
    // the config (knip); the projects below are what a run holds. The
    // projects do not extend the root, so the root's setup runs once a run.
    include: ALL,
    exclude: ["**/node_modules/**"],
    globalSetup: existsSync(privateSetup) ? [privateSetup] : [],
    testTimeout: TIMEOUT,
    passWithNoTests: true,
    // Coverage thresholds are a ratchet: floors get set from measured values
    // once M1's first slices land, then only rise at reviewed checkpoints.
    coverage: { provider: "v8" },
    projects: [
      {
        test: {
          name: "fast",
          include: ALL,
          exclude: ["**/node_modules/**", ...SLOW],
          testTimeout: TIMEOUT,
        },
      },
      ...(slow
        ? [
            {
              test: {
                name: "slow",
                include: SLOW,
                exclude: ["**/node_modules/**"],
                testTimeout: TIMEOUT,
              },
            },
          ]
        : []),
    ],
  },
});

export default config;
