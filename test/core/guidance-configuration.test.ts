import { describe, expect, it } from "vitest";
import { parseManifest, serializeManifest } from "../../src/core/manifest.ts";

describe("G3 guidance configuration", () => {
  it("G3 admits exactly configured and explicitly unconfigured repositories", () => {
    const base = {
      schemaVersion: 5,
      targets: ["codex"],
      skills: { include: [], exclude: [] },
    };
    for (const guidance of [
      { state: "configured", provider: "https://guidance.example/api/" },
      { state: "unconfigured" },
    ]) {
      const result = parseManifest(JSON.stringify({ ...base, guidance }), "manifest");
      expect(result._tag).toBe("ok");
      if (result._tag === "ok")
        expect(JSON.parse(serializeManifest(result.value)).guidance).toEqual(guidance);
    }
    for (const guidance of [
      undefined,
      { state: "auto" },
      { state: "configured" },
      { state: "configured", provider: "https://key:secret@example.com" },
      { state: "configured", provider: "http://remote.example" },
      { state: "unconfigured", provider: "https://example.com" },
    ]) {
      const result = parseManifest(JSON.stringify({ ...base, guidance }), "manifest");
      expect(
        result._tag === "err" &&
          result.error.issues.some((issue) => issue.path.startsWith("guidance")),
      ).toBe(true);
    }
  });
});
