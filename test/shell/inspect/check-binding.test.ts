import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseLock } from "../../../src/core/lock.ts";
import { startInspector, type InspectorHandle } from "../../../src/shell/inspect/server.ts";
import { CAREFUL, changesWorkspace } from "./fixture.ts";

/**
 * J-232 S1: a check run is bound to the commit whose code it ran on, the
 * code named by the tree rule of J-229 S1, which leaves out `.greenline/`
 * and every file the lock names. The trees are built here with git over the
 * test's own repository, apart from the product's reading, so a run on a
 * commit's tree under the current rule is bound to that commit, and a run on
 * the same commit's tree under the earlier rule, `.greenline/` alone left
 * out, or on any other tree, is bound to none. The Linear workspace's check
 * facts are in that earlier form (linear-workspace.test.ts).
 */

let root = "";
let finalCommit = "";
let handle: InspectorHandle | undefined;
let current = "";
let earlier = "";

/** The run's facts as `greenline check` writes them, on the given tree and commit. */
function facts(startedAt: string, tree: string, commit: string): string {
  return JSON.stringify({
    schemaVersion: 1,
    state: "finished",
    arguments: ["pnpm", "lint"],
    step: "verify",
    startedAt,
    commit,
    tree,
    installation: "c".repeat(64),
    outcome: { kind: "exited", code: 0 },
    durationMs: 900,
  });
}

beforeAll(async () => {
  const workspace = changesWorkspace();
  root = workspace.root;
  finalCommit = workspace.finalCommit;
  const scratch = mkdtempSync(join(tmpdir(), "greenline-binding-"));
  const index = join(scratch, "index");
  const git = (...args: string[]): string =>
    execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      env: { ...process.env, GIT_INDEX_FILE: index },
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const lock = parseLock(readFileSync(join(root, ".greenline/lock.json"), "utf8"), "lock");
  if (lock._tag !== "ok") throw new Error("the workspace's lock does not parse");
  const named = [...lock.value.files.keys()].filter((path) => !path.startsWith(".greenline/"));
  git("read-tree", finalCommit);
  git("rm", "-r", "-q", "--cached", ".greenline");
  earlier = git("write-tree");
  git("rm", "-q", "--cached", "--", ...named);
  current = git("write-tree");
  rmSync(scratch, { recursive: true, force: true });
  const checks = join(root, ".greenline/ledger", CAREFUL, "checks");
  writeFileSync(
    join(checks, "20261008T130000000Z-d4.json"),
    facts("2026-10-08T13:00:00.000Z", current, finalCommit),
  );
  writeFileSync(
    join(checks, "20261008T140000000Z-e5.json"),
    facts("2026-10-08T14:00:00.000Z", earlier, finalCommit),
  );
  handle = await startInspector(root, workspace.env, 0);
}, 60_000);

afterAll(async () => {
  await handle?.close();
  rmSync(root, { recursive: true, force: true });
});

describe("J-232 S1 a check run bound to the commit whose code it ran on", () => {
  it("binds a run on a commit's tree under the current rule to that commit, and a run on any other tree to none", async () => {
    // The lock names files the commit holds, so the two rules name two trees.
    expect(current).not.toBe(earlier);
    const response = await fetch(`${handle?.url ?? ""}api/changes/${CAREFUL}/checks`);
    const { checks } = await response.json();
    const target = checks.targets.find(
      (each: { hash: string | null }) => each.hash === finalCommit,
    );
    expect(target?.tree).toBe(current);
    const bound = target.runs.map((run: { file: string }) => run.file);
    expect(bound).toContain("checks/20261008T130000000Z-d4.json");
    expect(bound).not.toContain("checks/20261008T140000000Z-e5.json");
    for (const each of checks.targets)
      expect(each.runs.map((run: { file: string }) => run.file)).not.toContain(
        "checks/20261008T140000000Z-e5.json",
      );
    const elsewhere = checks.elsewhere.map((run: { file: string; tree: string }) => [
      run.file,
      run.tree,
    ]);
    expect(elsewhere).toContainEqual(["checks/20261008T140000000Z-e5.json", earlier]);
    expect(elsewhere).toContainEqual(["checks/20261008T100000000Z-a1.json", "d".repeat(40)]);
  });
});
