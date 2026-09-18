import { describe, expect, it } from "vitest";
import { isOk, match } from "../../src/commons/result.ts";
import {
  MANIFEST_SCHEMA_VERSION,
  parseManifest,
  serializeManifest,
  type Manifest,
} from "../../src/core/manifest.ts";

const SOURCE: string = ".greenline/manifest.json";

function manifestJson(body: string): string {
  return `{ "schemaVersion": ${MANIFEST_SCHEMA_VERSION}, "guidance": {"state":"unconfigured"}, ${body} }`;
}

describe("parseManifest", () => {
  it("parses a valid dual-target manifest", () => {
    const result = parseManifest(
      manifestJson(`"targets": ["codex", "claude-code"], "skills": { "exclude": [] }`),
      SOURCE,
    );
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.targets).toEqual(["codex", "claude-code"]);
    expect(result.value.skills.exclude).toEqual([]);
    expect(result.value.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
  });

  it("defaults missing skills to an empty exclusion list", () => {
    const result = parseManifest(manifestJson(`"targets": ["codex"]`), SOURCE);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.skills.exclude).toEqual([]);
  });

  it("rejects an unknown schema version with a located, explicit error", () => {
    const result = parseManifest(`{ "schemaVersion": 99, "targets": ["codex"] }`, SOURCE);
    expect(isOk(result)).toBe(false);
    if (isOk(result)) return;
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0]?.path).toBe("schemaVersion");
    expect(result.error.issues[0]?.message).toContain("99");
    expect(result.error.issues[0]?.message).toContain(String(MANIFEST_SCHEMA_VERSION));
  });

  it("rejects an invalid target with a located error", () => {
    const result = parseManifest(manifestJson(`"targets": ["cursor"]`), SOURCE);
    expect(isOk(result)).toBe(false);
    if (isOk(result)) return;
    expect(result.error.issues[0]?.path).toBe("targets[0]");
  });

  it("rejects an empty target list", () => {
    const result = parseManifest(manifestJson(`"targets": []`), SOURCE);
    expect(isOk(result)).toBe(false);
  });

  it("rejects unknown top-level fields", () => {
    const result = parseManifest(manifestJson(`"targets": ["codex"], "extras": 1`), SOURCE);
    expect(isOk(result)).toBe(false);
    if (isOk(result)) return;
    expect(result.error.issues.some((issue) => issue.message.includes("extras"))).toBe(true);
  });

  it("rejects invalid JSON entirely", () => {
    const result = parseManifest("{ not json", SOURCE);
    expect(isOk(result)).toBe(false);
    if (isOk(result)) return;
    expect(result.error.issues[0]?.message).toContain("valid JSON");
  });

  it("rejects non-object documents", () => {
    const result = parseManifest("[1, 2, 3]", SOURCE);
    expect(isOk(result)).toBe(false);
    if (isOk(result)) return;
    expect(result.error.issues[0]?.path).toBe("schemaVersion");
  });

  it("rejects duplicate entries in skills.exclude", () => {
    const result = parseManifest(
      manifestJson(`"targets": ["codex"], "skills": { "exclude": ["tdd", "tdd"] }`),
      SOURCE,
    );
    expect(isOk(result)).toBe(false);
    if (isOk(result)) return;
    expect(result.error.issues[0]?.path).toBe("skills.exclude");
    expect(result.error.issues[0]?.message).toContain("tdd");
  });

  it("parses deterministically: identical input yields identical models", () => {
    const json = manifestJson(`"targets": ["codex", "claude-code"]`);
    const first = parseManifest(json, SOURCE);
    const second = parseManifest(json, SOURCE);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("exposes the error source name", () => {
    const result = parseManifest(manifestJson(`"targets": ["nope"]`), SOURCE);
    const message = match(result, {
      ok: (value: Manifest): string => JSON.stringify(value),
      err: (error): string => error.message,
    });
    expect(message).toContain(SOURCE);
  });
});

describe("M7.1 manifest has no blanket review acknowledgement", () => {
  it("refuses the retired review date instead of silently clearing facts", () => {
    expect(
      parseManifest(
        JSON.stringify({
          guidance: { state: "unconfigured" },
          schemaVersion: 5,
          targets: ["codex"],
          review: "2026-09-06",
        }),
        "m",
      )._tag,
    ).toBe("err");
  });
});

describe("manifest include list (ADR 0029)", () => {
  const base = {
    guidance: { state: "unconfigured" },
    schemaVersion: 5,
    targets: ["codex"],
  };

  it("defaults the include list to empty and serializes it beside exclude", () => {
    const parsed = parseManifest(JSON.stringify(base), "m");
    expect(parsed._tag).toBe("ok");
    if (parsed._tag !== "ok") return;
    expect(parsed.value.skills.include).toEqual([]);
    expect(serializeManifest(parsed.value)).toContain('"include": []');
  });

  it("records the opt-in skills a workspace names and round-trips them", () => {
    const parsed = parseManifest(
      JSON.stringify({ ...base, skills: { include: ["diagram-design"] } }),
      "m",
    );
    expect(parsed._tag).toBe("ok");
    if (parsed._tag !== "ok") return;
    expect(parsed.value.skills.include).toEqual(["diagram-design"]);
    const reparsed = parseManifest(serializeManifest(parsed.value), "m");
    expect(reparsed._tag).toBe("ok");
    if (reparsed._tag !== "ok") return;
    expect(reparsed.value.skills.include).toEqual(["diagram-design"]);
  });

  it("rejects a duplicate include entry with a located error", () => {
    const result = parseManifest(
      JSON.stringify({ ...base, skills: { include: ["architecture-map", "architecture-map"] } }),
      "m",
    );
    expect(result._tag).toBe("err");
    if (result._tag !== "err") return;
    expect(JSON.stringify(result.error)).toContain("skills.include");
  });
});
