import { defineConfig, type ViteUserConfig } from "vitest/config";

const config: ViteUserConfig = defineConfig({
  test: {
    // Vendored anti-slop rules stay tested in our suite; their RuleTester
    // assertions run at import and register no vitest suites, hence
    // passWithNoTests.
    include: ["test/**/*.test.ts", "tools/oxlint/anti-slop/rules/*.test.ts"],
    exclude: ["**/node_modules/**"],
    testTimeout: 30_000,
    passWithNoTests: true,
    // Coverage thresholds are a ratchet: floors get set from measured values
    // once M1's first slices land, then only rise at reviewed checkpoints.
    coverage: { provider: "v8" },
  },
});

export default config;
