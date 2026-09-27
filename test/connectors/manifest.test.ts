import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/core/contract.ts";
import { parseManifest, serializeManifest } from "../../src/core/manifest.ts";

const SOURCE = ".greenline/manifest.json";
const choices = {
  schemaVersion: 6,
  targets: ["codex", "claude-code"],
  skills: { exclude: [], include: [] },
};
const entry = { endpoint: "https://garden.example/", executable: "garden" };

/** The issue paths and messages a refused manifest carries. */
function refusal(document: {
  readonly [key: string]: JsonValue;
}): readonly { path: string; message: string }[] {
  const parsed = parseManifest(JSON.stringify(document), SOURCE);
  if (parsed._tag === "ok") throw new Error("the manifest was accepted");
  return parsed.error.issues;
}

describe("manifest schema 6", () => {
  it("reads a manifest without a connectors map as every connector disabled", () => {
    const parsed = parseManifest(JSON.stringify(choices), SOURCE);
    expect(parsed._tag).toBe("ok");
    if (parsed._tag !== "ok") return;
    expect(parsed.value.connectors).toEqual({});
    expect(parsed.value.connectors.garden).toBeUndefined();
  });

  it("writes a manifest with no connector enabled without a connectors map", () => {
    const parsed = parseManifest(JSON.stringify({ ...choices, connectors: {} }), SOURCE);
    if (parsed._tag !== "ok") throw new Error("schema 6 with an empty map was refused");
    expect(serializeManifest(parsed.value)).toBe(`${JSON.stringify(choices, null, 2)}\n`);
  });

  it("reads and writes the garden entry, the bytes round-tripping exactly", () => {
    const text = `${JSON.stringify({ ...choices, connectors: { garden: entry } }, null, 2)}\n`;
    const parsed = parseManifest(text, SOURCE);
    expect(parsed._tag).toBe("ok");
    if (parsed._tag !== "ok") return;
    expect(parsed.value.connectors).toEqual({ garden: entry });
    expect(serializeManifest(parsed.value)).toBe(text);
  });

  it("canonicalizes the garden endpoint as it parses it", () => {
    const parsed = parseManifest(
      JSON.stringify({
        ...choices,
        connectors: { garden: { ...entry, endpoint: "https://garden.example/v1" } },
      }),
      SOURCE,
    );
    expect(parsed._tag === "ok" ? parsed.value.connectors.garden?.endpoint : undefined).toBe(
      "https://garden.example/v1/",
    );
  });

  it("refuses a schema 5 manifest without converting it", () => {
    const issues = refusal({ ...choices, schemaVersion: 5 });
    expect(issues).toEqual([
      {
        path: "schemaVersion",
        message: "unsupported manifest schema version '5' (expected 6)",
      },
    ]);
  });

  it("refuses a connector the registry does not hold, a plugin among them", () => {
    const issues = refusal({ ...choices, connectors: { garden: entry, "./plugin.mjs": {} } });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe("connectors");
    expect(issues[0]?.message).toContain('Unknown connector "./plugin.mjs"');
  });

  it("refuses a credential, or any field garden's entry does not define", () => {
    for (const extra of [{ key: "gdn_secret" }, { token: "secret" }, { env: "GARDEN_API_KEY" }]) {
      const issues = refusal({ ...choices, connectors: { garden: { ...entry, ...extra } } });
      expect(issues.map((issue) => issue.path)).toEqual(["connectors.garden"]);
    }
  });

  it("refuses an entry missing its endpoint or executable", () => {
    expect(
      refusal({ ...choices, connectors: { garden: { executable: "garden" } } }).map(
        (issue) => issue.path,
      ),
    ).toEqual(["connectors.garden.endpoint"]);
    expect(
      refusal({ ...choices, connectors: { garden: { endpoint: entry.endpoint } } }).map(
        (issue) => issue.path,
      ),
    ).toEqual(["connectors.garden.executable"]);
  });

  it("refuses an endpoint with a credential and an executable that is neither garden nor absolute", () => {
    expect(
      refusal({
        ...choices,
        connectors: { garden: { ...entry, endpoint: "https://reader:secret@garden.example/" } },
      }).map((issue) => issue.path),
    ).toEqual(["connectors.garden.endpoint"]);
    expect(
      refusal({
        ...choices,
        connectors: { garden: { ...entry, executable: "tools/garden" } },
      }).map((issue) => issue.path),
    ).toEqual(["connectors.garden.executable"]);
  });

  it("refuses including the connector's skill, which only its connector installs", () => {
    const issues = refusal({ ...choices, skills: { include: ["use-garden"], exclude: [] } });
    expect(issues.map((issue) => issue.path)).toEqual(["skills.include[0]"]);
    expect(issues[0]?.message).toContain("greenline connectors enable garden");
  });

  it("refuses excluding the connector's skill while the connector is enabled", () => {
    const issues = refusal({
      ...choices,
      skills: { include: [], exclude: ["use-garden"] },
      connectors: { garden: entry },
    });
    expect(issues.map((issue) => issue.path)).toEqual(["skills.exclude[0]"]);
    expect(issues[0]?.message).toContain("greenline connectors disable garden");
  });

  it("keeps an exclusion of the connector's skill while the connector is disabled", () => {
    const parsed = parseManifest(
      JSON.stringify({ ...choices, skills: { include: [], exclude: ["use-garden"] } }),
      SOURCE,
    );
    expect(parsed._tag === "ok" ? parsed.value.skills.exclude : undefined).toEqual(["use-garden"]);
  });
});
