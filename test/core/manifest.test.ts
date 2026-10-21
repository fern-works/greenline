import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isOk, match } from "../../src/commons/result.ts";
import {
  MANIFEST_SCHEMA_VERSION,
  parseManifest,
  serializeManifest,
  type Manifest,
  type ManifestRoster,
} from "../../src/core/manifest.ts";
import { parseModes, type ModesDefinition } from "../../src/core/modes.ts";

const corpusModes = join(import.meta.dirname, "..", "..", "corpus", "runtime", "modes.json");

const SOURCE: string = ".greenline/manifest.json";

function manifestJson(body: string): string {
  return `{ "schemaVersion": ${MANIFEST_SCHEMA_VERSION}, ${body} }`;
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
          schemaVersion: 6,
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
    schemaVersion: 6,
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

describe("S16b the proceed and trials settings", () => {
  const base = { schemaVersion: 6, targets: ["codex"] };
  const modes = (): ModesDefinition => {
    const parsed = parseModes(readFileSync(corpusModes, "utf8"), corpusModes);
    if (parsed._tag === "err") throw parsed.error;
    return parsed.value;
  };
  const roster = (): ManifestRoster => ({
    skills: ["idea-refine", "tdd"],
    trials: ["idea-refine"],
    modes: modes(),
  });
  /** The two settings as a test writes them, a value possibly of the wrong type. */
  interface WrittenSettings {
    readonly proceed?: string;
    readonly trials?: readonly (string | number)[];
  }
  const issuesOf = (value: WrittenSettings, given?: ManifestRoster): readonly string[] => {
    const parsed = parseManifest(JSON.stringify({ ...base, ...value }), "m", given);
    return parsed._tag === "err"
      ? parsed.error.issues.map((issue) => `${issue.path}: ${issue.message}`)
      : [];
  };

  it("S16b defaults proceed to none and trials to empty, and the serializer writes both", () => {
    const parsed = parseManifest(JSON.stringify(base), "m", roster());
    expect(parsed._tag).toBe("ok");
    if (parsed._tag !== "ok") return;
    expect(parsed.value.proceed).toBe("none");
    expect(parsed.value.trials).toEqual([]);
    const text = serializeManifest(parsed.value);
    expect(text).toContain('"proceed": "none"');
    expect(text).toContain('"trials": []');
  });

  it("S16b takes proceed at a mode of the definition and an enabled trial skill, round-tripped", () => {
    const parsed = parseManifest(
      JSON.stringify({ ...base, proceed: "regular", trials: ["idea-refine"] }),
      "m",
      roster(),
    );
    expect(parsed._tag).toBe("ok");
    if (parsed._tag !== "ok") return;
    expect(parsed.value.proceed).toBe("regular");
    expect(parsed.value.trials).toEqual(["idea-refine"]);
    const again = parseManifest(serializeManifest(parsed.value), "m", roster());
    expect(again._tag === "ok" ? again.value : again).toEqual(parsed.value);
  });

  it("S16b refuses a proceed that is neither none nor a mode of the definition, naming the values", () => {
    expect(issuesOf({ proceed: "fastest" }, roster())).toEqual([
      "proceed: proceed is none, quick, regular, careful, not 'fastest'",
    ]);
  });

  it("S17 and J-93 S1 refuse a trial entry that is not a trial skill, a step of the line included, naming the trial skills", () => {
    expect(issuesOf({ trials: ["anticipate", "sketch", "tdd"] }, roster())).toEqual([
      "trials[0]: 'anticipate' is not a trial skill; the trial skills are idea-refine",
      "trials[1]: 'sketch' is not a trial skill; the trial skills are idea-refine",
      "trials[2]: 'tdd' is not a trial skill; the trial skills are idea-refine",
    ]);
  });

  it("S17 takes a trial skill, round-tripped", () => {
    const parsed = parseManifest(
      JSON.stringify({ ...base, trials: ["idea-refine"] }),
      "m",
      roster(),
    );
    expect(parsed._tag === "ok" ? parsed.value.trials : parsed).toEqual(["idea-refine"]);
  });

  it("S17 says so when the installation holds no trial skill", () => {
    expect(issuesOf({ trials: ["sketch"] }, { ...roster(), trials: [] })).toEqual([
      "trials[0]: 'sketch' is not a trial skill; the installation holds no trial skill",
    ]);
  });

  it("S16b refuses a trial named twice, and a setting that is not a name, without the modes", () => {
    expect(issuesOf({ trials: ["idea-refine", "idea-refine"] })).toEqual([
      "trials: Duplicate entry: idea-refine, idea-refine",
    ]);
    expect(issuesOf({ proceed: "Fast" })).toHaveLength(1);
    expect(issuesOf({ trials: [3] })).toHaveLength(1);
  });

  it("S16b reads the settings as written when no installation is loaded", () => {
    expect(issuesOf({ proceed: "fastest", trials: ["sketch"] })).toEqual([]);
  });
});
