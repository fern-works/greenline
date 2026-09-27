import { describe, expect, it } from "vitest";
import { providerUrl } from "../../src/core/guidance-configuration.ts";
import { parseManifest } from "../../src/core/manifest.ts";

describe("guidance configuration leaves the manifest", () => {
  it("refuses a manifest that still declares guidance in any form, with no converter (D-20)", () => {
    const base = {
      schemaVersion: 6,
      targets: ["codex"],
      skills: { include: [], exclude: [] },
    };
    expect(parseManifest(JSON.stringify(base), "manifest")._tag).toBe("ok");
    for (const guidance of [
      { state: "configured", provider: "https://guidance.example/api/" },
      { state: "unconfigured" },
      null,
    ]) {
      const result = parseManifest(JSON.stringify({ ...base, guidance }), "manifest");
      expect(result._tag).toBe("err");
      if (result._tag === "err")
        expect(result.error.issues.map((issue) => issue.message).join("\n")).toContain("guidance");
    }
  });

  it("canonicalizes a provider endpoint, and refuses credentials, a query, a fragment or plain HTTP off loopback", () => {
    expect(providerUrl("https://garden.example/api")).toBe("https://garden.example/api/");
    expect(providerUrl("http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787/");
    for (const input of [
      "https://key:secret@example.com",
      "http://remote.example",
      "https://example.com/?q=1",
      "https://example.com/#top",
      "not a url",
    ])
      expect(providerUrl(input)).toBeUndefined();
  });
});
