import { describe, expect, it } from "vitest";
import { isOk } from "../../src/commons/result.ts";
import { parseLock, serializeLock, type LockFile } from "../../src/core/lock.ts";
import { parseManifest, serializeManifest, type Manifest } from "../../src/core/manifest.ts";

/**
 * Config serializers must round-trip: what the CLI writes, its own
 * parsers must accept back with the same normalized model.
 */

describe("serializeManifest", () => {
  const manifest: Manifest = {
    schemaVersion: 6,
    targets: ["codex"],
    skills: { exclude: ["grilling"], include: [] },
    connectors: {},
    proceed: "none",
    trials: [],
    checks: [],
    hooks: { git: true, adapters: true },
  };

  it("serializes deterministically with fixed field order, the settings always written", () => {
    const text = serializeManifest(manifest);
    expect(text).toBe(
      '{\n  "schemaVersion": 6,\n  "targets": [\n    "codex"\n  ],\n  "skills": {\n    "exclude": [\n      "grilling"\n    ],\n    "include": []\n  },\n  "proceed": "none",\n  "trials": [],\n  "checks": [],\n  "hooks": {\n    "git": true,\n    "adapters": true\n  }\n}\n',
    );
  });

  it("round-trips through parseManifest", () => {
    const parsed = parseManifest(serializeManifest(manifest), "manifest.json");
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;
    expect(parsed.value).toEqual(manifest);
  });
});

describe("serializeLock", () => {
  const lock: LockFile = {
    schemaVersion: 5,
    cliVersion: "0.1.0",
    installationRevision: "c".repeat(64),
    sources: [{ name: "mattpocock-skills", repo: "mattpocock/skills", commit: null }],
    files: new Map([
      ["z.txt", "b".repeat(64)],
      ["a.txt", "a".repeat(64)],
    ]),
  };

  it("serializes files in sorted path order", () => {
    const text = serializeLock(lock);
    expect(text.indexOf('"a.txt"')).toBeLessThan(text.indexOf('"z.txt"'));
  });

  it("round-trips through parseLock", () => {
    const parsed = parseLock(serializeLock(lock), "lock.json");
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;
    expect(parsed.value).toEqual(lock);
  });
});
