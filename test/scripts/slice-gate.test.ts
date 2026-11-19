import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

/**
 * The narrowed full tier the overseer may run by hand (J-157 S1; since the
 * register's row of 2026-11-10 a slice's gate is the fast tier, J-231 S1):
 * beside --full, --no-public leaves the public-gate row out and --no-coverage
 * leaves coverage out, each listed as a skip naming its flag, so the summary
 * says what was not run. The gate script runs in a tree that holds it and the
 * modules it imports at start, narrowed to the two rows. The fast tier runs
 * the knip row (J-233 S1).
 */

const GREENLINE = fileURLToPath(new URL("../..", import.meta.url));
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const gateTree = () => {
  const root = mkdtempSync(join(tmpdir(), "greenline-slice-gate-"));
  roots.push(root);
  for (const path of [
    "scripts/check.mjs",
    "scripts/lib/commit-subject.mjs",
    "scripts/lib/gate-outcome.mjs",
    "scripts/lib/name-boundary.mjs",
  ]) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    copyFileSync(join(GREENLINE, path), join(root, path));
  }
  return root;
};
const run = (args: string[], rows = "public-gate,coverage") =>
  spawnSync(process.execPath, ["scripts/check.mjs", ...args], {
    cwd: gateTree(),
    encoding: "utf8",
    env: { ...process.env, CHECK_ROWS: rows },
  });
const summary = (stdout: string, row: string) =>
  stdout.split("\n").find((line) => line.startsWith(`${row} `)) ?? "";

describe("the slice gate's flags", () => {
  it("lists the public gate and coverage as skips naming their flags", () => {
    const gate = run(["--full", "--no-public", "--no-coverage"]);
    expect(gate.status).toBe(0);
    expect(summary(gate.stdout, "public-gate")).toMatch(/SKIP\s+— left out by --no-public/);
    expect(summary(gate.stdout, "coverage")).toMatch(/SKIP\s+— left out by --no-coverage/);
    // A slice's gate is the fast tier (J-231 S1): the skips name no retired gate.
    expect(summary(gate.stdout, "public-gate")).not.toContain("slice gate");
    expect(summary(gate.stdout, "coverage")).not.toContain("slice gate");
  });

  it("keeps the coverage row out of a full tier that runs coverage", () => {
    const gate = run(["--full", "--no-public"]);
    expect(gate.status).toBe(0);
    expect(summary(gate.stdout, "coverage")).toBe("");
    expect(summary(gate.stdout, "public-gate")).toMatch(/SKIP\s+— left out by --no-public/);
  });

  it("runs the knip row in the fast tier, a slice's gate (J-233 S1)", () => {
    const gate = run([], "knip");
    expect(gate.status).toBe(0);
    // The tree holds no toolchain, so the row runs and skips on that; a row
    // the tier left out would print no summary line at all.
    expect(summary(gate.stdout, "knip")).toMatch(/^knip\s+SKIP\s+\u2014 toolchain not installed/);
  });
});
