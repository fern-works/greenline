import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../src/commons/hash.ts";
import {
  isAgentsOverridePresent,
  planManagedFiles,
  type FileTarget,
} from "../../src/core/managed-file.ts";

const hash = (content: string): string => sha256Hex(content);

/** A whole-file target: bytes to write equal the owned region. */
const target = (content: string): FileTarget => ({ text: content, owned: content });

describe("planManagedFiles", () => {
  it("creates a managed path that does not exist on disk", () => {
    const plan = planManagedFiles({
      desired: new Map([["a", target("new")]]),
      locked: new Map(),
      disk: new Map(),
    });
    expect(plan).toEqual([{ kind: "create", path: "a", content: "new" }]);
  });

  it("keeps a path unchanged when the disk already matches", () => {
    const plan = planManagedFiles({
      desired: new Map([["a", target("same")]]),
      locked: new Map(),
      disk: new Map([["a", hash("same")]]),
    });
    expect(plan).toEqual([{ kind: "unchanged", path: "a" }]);
  });

  it("updates a path the lock owns when the desired content changed", () => {
    const oldHash = hash("old");
    const plan = planManagedFiles({
      desired: new Map([["a", target("new")]]),
      locked: new Map([["a", oldHash]]),
      disk: new Map([["a", oldHash]]),
    });
    expect(plan).toEqual([{ kind: "update", path: "a", content: "new" }]);
  });

  it("flags a user-modified managed path as a conflict", () => {
    const plan = planManagedFiles({
      desired: new Map([["a", target("ours")]]),
      locked: new Map([["a", hash("ours")]]),
      disk: new Map([["a", hash("user edit")]]),
    });
    expect(plan).toEqual([
      { kind: "conflict", path: "a", reason: "user-modified region differs from the lock" },
    ]);
  });

  it("flags an unmanaged file occupying a managed path as a conflict", () => {
    const plan = planManagedFiles({
      desired: new Map([["a", target("ours")]]),
      locked: new Map(),
      disk: new Map([["a", hash("someone else's file")]]),
    });
    expect(plan).toEqual([
      { kind: "conflict", path: "a", reason: "unmanaged file occupies a managed path" },
    ]);
  });

  it("orphans a locked path we no longer generate when it still exists", () => {
    const plan = planManagedFiles({
      desired: new Map(),
      locked: new Map([["gone", hash("old")]]),
      disk: new Map([["gone", hash("old")]]),
    });
    expect(plan).toEqual([{ kind: "orphan", path: "gone" }]);
  });

  it("does nothing for a locked path that no longer exists anywhere", () => {
    const plan = planManagedFiles({
      desired: new Map(),
      locked: new Map([["gone", hash("old")]]),
      disk: new Map(),
    });
    expect(plan).toEqual([]);
  });

  it("ignores unrelated disk files that Green Line never manages", () => {
    const plan = planManagedFiles({
      desired: new Map([["a", target("ours")]]),
      locked: new Map(),
      disk: new Map([["notes.md", hash("user notes")]]),
    });
    expect(plan).toEqual([{ kind: "create", path: "a", content: "ours" }]);
  });

  it("tracks only the owned region of a block target", () => {
    // The user content around the block is not part of the owned hash,
    // so the disk matches as long as the generated block is unchanged.
    const blockTarget: FileTarget = {
      text: "own\nblock\n<!-- header\nuser line\n",
      owned: "block",
    };
    const plan = planManagedFiles({
      desired: new Map([["AGENTS.md", blockTarget]]),
      locked: new Map([["AGENTS.md", hash("block")]]),
      disk: new Map([["AGENTS.md", hash("block")]]),
    });
    expect(plan).toEqual([{ kind: "unchanged", path: "AGENTS.md" }]);
  });

  it("updates a block target when the owned region changed, regardless of user bytes", () => {
    const blockTarget: FileTarget = {
      text: "own\nnew-block\n<!-- header\nuser line\n",
      owned: "new-block",
    };
    const plan = planManagedFiles({
      desired: new Map([["AGENTS.md", blockTarget]]),
      locked: new Map([["AGENTS.md", hash("block")]]),
      disk: new Map([["AGENTS.md", hash("block")]]),
    });
    expect(plan).toEqual([{ kind: "update", path: "AGENTS.md", content: blockTarget.text }]);
  });

  it("emits a deterministic plan in sorted path order", () => {
    const input = {
      desired: new Map([
        ["z", target("z-content")],
        ["a", target("a-content")],
        ["m", target("m-content")],
      ]),
      locked: new Map<string, string>(),
      disk: new Map<string, string>(),
    };
    const plan = planManagedFiles(input);
    expect(plan.map((entry) => entry.path)).toEqual(["a", "m", "z"]);
    expect(JSON.stringify(planManagedFiles(input))).toBe(JSON.stringify(planManagedFiles(input)));
  });

  it("carries the exact content to write on create and update entries", () => {
    const plan = planManagedFiles({
      desired: new Map([
        ["a", target("one")],
        ["b", target("two")],
      ]),
      locked: new Map([["a", hash("old")]]),
      disk: new Map([["a", hash("old")]]),
    });
    expect(plan).toEqual([
      { kind: "update", path: "a", content: "one" },
      { kind: "create", path: "b", content: "two" },
    ]);
  });
});

describe("isAgentsOverridePresent", () => {
  it("flags a root AGENTS.override.md and ignores nested ones", () => {
    expect(isAgentsOverridePresent(new Map([["AGENTS.override.md", hash("x")]]))).toBe(true);
    expect(isAgentsOverridePresent(new Map([["docs/AGENTS.override.md", hash("x")]]))).toBe(false);
    expect(isAgentsOverridePresent(new Map())).toBe(false);
  });
});
