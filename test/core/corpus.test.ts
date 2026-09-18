import { describe, expect, it } from "vitest";
import { activationOf, isVendored, parseCorpusManifest } from "../../src/core/corpus.ts";

const fixture = {
  schemaVersion: 8,
  upstreams: [
    {
      name: "example-skills",
      repo: "https://github.com/example/skills",
      commit: "a".repeat(40),
      license: "MIT",
      snapshot: "upstream/example-skills/aaaaaaaa",
    },
  ],
  skills: [
    {
      name: "grilling",
      class: "situational",
      upstream: { family: "example-skills", name: "grilling", path: "skills/grilling" },
    },
  ],
  intents: [{ intent: "Shape a change", skills: ["grilling"] }],
} as const;

function validManifest(): string {
  return JSON.stringify(fixture);
}

describe("the holder and the credits", () => {
  it("accepts a copyright line as holder on a family and refuses a holder that is not one", () => {
    const held = {
      ...fixture,
      upstreams: [{ ...fixture.upstreams[0], holder: "Copyright (c) 2026 An Author" }],
    };
    const parsed = parseCorpusManifest(JSON.stringify(held), "c");
    expect(parsed._tag === "ok" && parsed.value.upstreams[0]?.holder).toBe(
      "Copyright (c) 2026 An Author",
    );
    const bare = { ...fixture, upstreams: [{ ...fixture.upstreams[0], holder: "An Author" }] };
    expect(parseCorpusManifest(JSON.stringify(bare), "c")._tag).toBe("err");
  });
  it("parses a credits note on an opt-in skill and refuses one on a skill that is not opt-in", () => {
    const credited = {
      ...fixture,
      skills: [
        { ...fixture.skills[0], optIn: true, credits: "icon catalog credits Tabler Icons (MIT)." },
      ],
    };
    const parsed = parseCorpusManifest(JSON.stringify(credited), "c");
    expect(parsed._tag === "ok" && parsed.value.skills[0]?.credits).toBe(
      "icon catalog credits Tabler Icons (MIT).",
    );
    const loose = {
      ...fixture,
      skills: [{ ...fixture.skills[0], credits: "icon catalog credits Tabler Icons (MIT)." }],
    };
    expect(parseCorpusManifest(JSON.stringify(loose), "c")._tag).toBe("err");
  });
});

describe("parseCorpusManifest", () => {
  it("parses a valid manifest", () => {
    const result = parseCorpusManifest(validManifest(), "corpus/manifest.json");
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    expect(result.value.upstreams[0]?.commit).toBe("a".repeat(40));
    expect(result.value.skills[0]?.class).toBe("situational");
    expect(result.value.skills.map(isVendored)).toEqual([true]);
  });

  it("derives activation from the class and states it only as an exception (ADR 0039)", () => {
    const result = parseCorpusManifest(validManifest(), "c");
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    const entry = result.value.skills[0];
    expect(entry !== undefined && activationOf(entry)).toBe("implicit");
    const exception = JSON.stringify({
      ...fixture,
      skills: [{ ...fixture.skills[0], activation: "explicit" }],
    });
    const parsedException = parseCorpusManifest(exception, "c");
    expect(parsedException._tag).toBe("ok");
    if (parsedException._tag !== "ok") return;
    const stated = parsedException.value.skills[0];
    expect(stated !== undefined && activationOf(stated)).toBe("explicit");
    const redundant = JSON.stringify({
      ...fixture,
      skills: [{ ...fixture.skills[0], activation: "implicit" }],
    });
    expect(parseCorpusManifest(redundant, "c")._tag).toBe("err");
    const workflow = JSON.stringify({
      ...fixture,
      skills: [{ ...fixture.skills[0], class: "stage" }],
    });
    const parsedWorkflow = parseCorpusManifest(workflow, "c");
    expect(parsedWorkflow._tag).toBe("ok");
    if (parsedWorkflow._tag !== "ok") return;
    const stage = parsedWorkflow.value.skills[0];
    expect(stage !== undefined && activationOf(stage)).toBe("explicit");
    expect(
      parseCorpusManifest(
        JSON.stringify({ ...fixture, skills: [{ ...fixture.skills[0], class: "lens" }] }),
        "c",
      )._tag,
    ).toBe("err");
  });

  it("accepts the opt-in tag on vendored and native entries and refuses any other value (ADR 0029)", () => {
    const tagged = JSON.stringify({
      ...fixture,
      skills: [
        { ...fixture.skills[0], optIn: true },
        { name: "native-map", class: "situational", optIn: true },
      ],
      intents: [{ intent: "Shape a change", skills: ["grilling", "native-map"] }],
    });
    const result = parseCorpusManifest(tagged, "c");
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    expect(result.value.skills.map((skill) => skill.optIn)).toEqual([true, true]);
    const falsy = JSON.stringify({ ...fixture, skills: [{ ...fixture.skills[0], optIn: false }] });
    expect(parseCorpusManifest(falsy, "c")._tag).toBe("err");
  });

  it("rejects invalid JSON", () => {
    expect(parseCorpusManifest("{", "corpus/manifest.json")._tag).toBe("err");
  });

  it("rejects the retired schema version 4", () => {
    const raw = JSON.stringify({ ...fixture, schemaVersion: 4 });
    expect(parseCorpusManifest(raw, "c")._tag).toBe("err");
  });

  it("rejects an unknown license value", () => {
    const raw = JSON.stringify({
      ...fixture,
      upstreams: [{ ...fixture.upstreams[0], license: "WTFPL" }],
    });
    expect(parseCorpusManifest(raw, "c")._tag).toBe("err");
  });

  it("rejects a short commit hash", () => {
    const raw = JSON.stringify({
      ...fixture,
      upstreams: [{ ...fixture.upstreams[0], commit: "abc123" }],
    });
    expect(parseCorpusManifest(raw, "c")._tag).toBe("err");
  });

  it("rejects duplicate upstream family names", () => {
    const raw = JSON.stringify({
      ...fixture,
      upstreams: [fixture.upstreams[0], { ...fixture.upstreams[0], snapshot: "upstream/other/bb" }],
    });
    const result = parseCorpusManifest(raw, "c");
    expect(result._tag).toBe("err");
    if (result._tag !== "err") return;
    expect(result.error.issues.some((issue) => issue.message.includes("duplicate"))).toBe(true);
  });

  it("rejects a vendored skill naming an unknown family", () => {
    const raw = JSON.stringify({
      ...fixture,
      skills: [
        {
          name: "grilling",
          class: "situational",
          upstream: { family: "nope", name: "grilling", path: "skills/grilling" },
        },
      ],
    });
    const result = parseCorpusManifest(raw, "c");
    expect(result._tag).toBe("err");
    if (result._tag !== "err") return;
    expect(result.error.issues.some((issue) => issue.message.includes("family"))).toBe(true);
  });

  it("accepts a dot-leading upstream provenance path", () => {
    const raw = JSON.stringify({
      ...fixture,
      skills: [
        {
          name: "grilling",
          class: "situational",
          upstream: {
            family: "example-skills",
            name: "grilling",
            path: ".agents/rules/grilling.md",
          },
        },
      ],
    });
    expect(parseCorpusManifest(raw, "c")._tag).toBe("ok");
  });

  it("rejects traversal in upstream paths", () => {
    const raw = JSON.stringify({
      ...fixture,
      skills: [
        {
          name: "evil",
          class: "discipline",
          upstream: { family: "example-skills", name: "evil", path: "skills/../../evil" },
        },
      ],
    });
    const result = parseCorpusManifest(raw, "c");
    expect(result._tag).toBe("err");
    if (result._tag !== "err") return;
    expect(result.error.issues.some((issue) => issue.message.includes("escapes"))).toBe(true);
  });

  it("rejects duplicate greenline names", () => {
    const raw = JSON.stringify({
      ...fixture,
      skills: [
        {
          name: "a",
          class: "discipline",
          upstream: { family: "example-skills", name: "x", path: "skills/x" },
        },
        {
          name: "a",
          class: "discipline",
          upstream: { family: "example-skills", name: "y", path: "skills/y" },
        },
      ],
    });
    const result = parseCorpusManifest(raw, "c");
    expect(result._tag).toBe("err");
    if (result._tag !== "err") return;
    expect(result.error.issues.some((issue) => issue.message.includes("duplicate"))).toBe(true);
  });

  it("rejects unknown fields, including the retired description override and native flag", () => {
    expect(parseCorpusManifest(JSON.stringify({ ...fixture, extra: true }), "c")._tag).toBe("err");
    expect(
      parseCorpusManifest(
        JSON.stringify({ ...fixture, skills: [{ ...fixture.skills[0], description: "d" }] }),
        "c",
      )._tag,
    ).toBe("err");
    expect(
      parseCorpusManifest(
        JSON.stringify({ ...fixture, skills: [{ ...fixture.skills[0], native: true }] }),
        "c",
      )._tag,
    ).toBe("err");
  });

  it("parses a native entry as one without an upstream, and accepts a ledger pin on it", () => {
    const native = { name: "project-router", class: "entry" };
    const raw = JSON.stringify({
      ...fixture,
      skills: [...fixture.skills, native],
      intents: [{ intent: "Shape a change", skills: ["grilling", "project-router"] }],
    });
    const result = parseCorpusManifest(raw, "c");
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    const router = result.value.skills.find((skill) => skill.name === "project-router");
    expect(router).toEqual(native);
    expect(router !== undefined && isVendored(router)).toBe(false);
    const pinned = JSON.stringify({
      ...fixture,
      skills: [{ ...native, ledger: { id: "baseline", revision: "a".repeat(64) } }],
      intents: [{ intent: "Shape a change", skills: ["project-router"] }],
    });
    expect(parseCorpusManifest(pinned, "c")._tag).toBe("ok");
  });
});
