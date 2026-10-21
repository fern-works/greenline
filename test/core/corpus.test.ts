import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  activationOf,
  isVendored,
  kindActivation,
  parseCorpusManifest,
} from "../../src/core/corpus.ts";
import { kindNamed, parseModes, type Kind } from "../../src/core/modes.ts";
import { FIXTURE_MODES } from "../fixtures/chain.ts";

const fixture = {
  schemaVersion: 11,
  sources: [
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
      kind: "step",
      slot: "frame",
      upstream: { family: "example-skills", name: "grilling", path: "skills/grilling" },
    },
  ],
  intents: [{ intent: "Shape a change", skills: ["grilling"] }],
} as const;

/** A fourth kind no code knows, beside the line; its mechanism is the test's. */
const GATE_KIND = {
  name: "gate",
  record: "line",
  place: "beside",
  budget: "free",
  when: "A fixture gate holds the change until its check passes.",
};

function validManifest(): string {
  return JSON.stringify(fixture);
}

describe("the holder and the credits", () => {
  it("accepts a copyright line as holder on a family and refuses a holder that is not one", () => {
    const held = {
      ...fixture,
      sources: [{ ...fixture.sources[0], holder: "Copyright (c) 2026 An Author" }],
    };
    const parsed = parseCorpusManifest(JSON.stringify(held), "c");
    expect(parsed._tag === "ok" && parsed.value.sources[0]?.holder).toBe(
      "Copyright (c) 2026 An Author",
    );
    const bare = { ...fixture, sources: [{ ...fixture.sources[0], holder: "An Author" }] };
    expect(parseCorpusManifest(JSON.stringify(bare), "c")._tag).toBe("err");
  });
  it("S16a parses a credits note on an extra skill and refuses one on a skill that is not extra", () => {
    const credited = {
      ...fixture,
      skills: [
        { ...fixture.skills[0], extra: true, credits: "icon catalog credits Tabler Icons (MIT)." },
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

describe("R4: the kind, the slot and the flags of a roster skill", () => {
  /** The refusals of the fixture with its one skill changed by `change`. */
  function refusals(change: {
    readonly [field: string]: string | boolean | undefined;
  }): readonly string[] {
    const result = parseCorpusManifest(
      JSON.stringify({ ...fixture, skills: [{ ...fixture.skills[0], ...change }] }),
      "c",
    );
    return result._tag === "err"
      ? result.error.issues.map((issue) => `${issue.path}: ${issue.message}`)
      : [];
  }

  it("parses a step skill's kind and slot, a habit and a start without a slot, and the flags stated only when true", () => {
    const raw = JSON.stringify({
      ...fixture,
      skills: [
        fixture.skills[0],
        { name: "secrets", kind: "habit", trial: true },
        { name: "map", kind: "start", extra: true },
      ],
      intents: [{ intent: "Shape a change", skills: ["grilling"] }],
    });
    const result = parseCorpusManifest(raw, "c");
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    expect(
      result.value.skills.map((skill) => [skill.kind, skill.slot, skill.extra, skill.trial]),
    ).toEqual([
      ["step", "frame", undefined, undefined],
      ["habit", undefined, undefined, true],
      ["start", undefined, true, undefined],
    ]);
  });

  it("R5 takes a kind's name as it stands, since the kinds and their slots are the modes definition's, which verify reads", () => {
    expect(refusals({ kind: "gate" })).toEqual([]);
    expect(refusals({ kind: "habit" })).toEqual([]);
  });

  it("refuses a skill without a kind", () => {
    expect(refusals({ kind: undefined, slot: undefined })).toEqual([
      "skills[0].kind: a roster skill states its kind, a kind of the modes definition",
    ]);
  });

  it("R5 refuses a kind that is not a kebab-case name", () => {
    expect(refusals({ kind: "Step" })).toEqual(["skills[0].kind: a kind is a kebab-case name"]);
  });

  it.each(["extra", "trial"])("refuses the %s flag stated as false", (flag) => {
    expect(refusals({ [flag]: false }).join("; ")).toContain(`skills[0].${flag}`);
  });
});

describe("parseCorpusManifest", () => {
  it("parses a valid manifest", () => {
    const result = parseCorpusManifest(validManifest(), "corpus/manifest.json");
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    expect(result.value.sources[0]?.commit).toBe("a".repeat(40));
    expect(result.value.skills[0]?.kind).toBe("step");
    expect(result.value.skills.map(isVendored)).toEqual([true]);
  });

  it("S16a takes the activation from the kind's mechanism, a step and a start explicit and a habit implicit, and a stated one over it", () => {
    const corpus = parseModes(readFileSync("corpus/runtime/modes.json", "utf8"), "modes.json");
    if (corpus._tag === "err") throw corpus.error;
    const kind = (name: string): Kind => {
      const found = kindNamed(corpus.value, name);
      if (found === undefined) throw new Error(`the corpus declares ${name}`);
      return found;
    };
    expect(["step", "start", "habit"].map((name) => kindActivation(kind(name)))).toEqual([
      "explicit",
      "explicit",
      "implicit",
    ]);
    expect(activationOf({}, kind("step"))).toBe("explicit");
    expect(activationOf({ activation: "implicit" }, kind("step"))).toBe("implicit");
    expect(activationOf({ activation: "explicit" }, kind("habit"))).toBe("explicit");
  });

  it("S16a takes a gained kind's activation from its mechanism, with no code of its own", () => {
    // SAFETY: FIXTURE_MODES is the fixture's own definition, which declares its kinds as an array.
    const raw = JSON.parse(FIXTURE_MODES) as { kinds: readonly object[] };
    const gained = (mechanism: string): Kind => {
      const gate = { ...GATE_KIND, mechanism };
      const parsed = parseModes(JSON.stringify({ ...raw, kinds: [...raw.kinds, gate] }), "m");
      if (parsed._tag === "err") throw parsed.error;
      const found = kindNamed(parsed.value, "gate");
      if (found === undefined) throw new Error("the fixture declares the gate");
      return found;
    };
    expect(kindActivation(gained("arise"))).toBe("implicit");
    expect(kindActivation(gained("open"))).toBe("explicit");
    expect(kindActivation(gained("reach"))).toBe("explicit");
  });

  it("S16a refuses the retired class and optIn fields and the extra flag stated false", () => {
    for (const retired of [{ class: "stage" }, { optIn: true }, { extra: false }])
      expect(
        parseCorpusManifest(
          JSON.stringify({ ...fixture, skills: [{ ...fixture.skills[0], ...retired }] }),
          "c",
        )._tag,
        JSON.stringify(retired),
      ).toBe("err");
  });

  it("S16a refuses a schema 10 manifest by its version, before reading any field", () => {
    const schema10 = JSON.stringify({
      ...fixture,
      schemaVersion: 10,
      skills: [{ ...fixture.skills[0], class: "stage" }],
    });
    const result = parseCorpusManifest(schema10, "c");
    expect(result._tag === "err" && result.error.issues).toEqual([
      {
        path: "schemaVersion",
        message: "unsupported corpus manifest schema version '10' (expected 11)",
      },
    ]);
  });

  it("rejects invalid JSON", () => {
    expect(parseCorpusManifest("{", "corpus/manifest.json")._tag).toBe("err");
  });

  it("rejects the retired schema version 4", () => {
    const raw = JSON.stringify({ ...fixture, schemaVersion: 4 });
    expect(parseCorpusManifest(raw, "c")._tag).toBe("err");
  });

  it("R4: refuses a schema 9 manifest with its version named, before reading any field", () => {
    const { kind: _kind, slot: _slot, ...classOnly } = fixture.skills[0];
    const schema9 = JSON.stringify({ ...fixture, schemaVersion: 9, skills: [classOnly] });
    const result = parseCorpusManifest(schema9, "c");
    expect(result._tag).toBe("err");
    if (result._tag !== "err") return;
    expect(result.error.issues).toEqual([
      {
        path: "schemaVersion",
        message: "unsupported corpus manifest schema version '9' (expected 11)",
      },
    ]);
  });

  it("rejects an unknown license value", () => {
    const raw = JSON.stringify({
      ...fixture,
      sources: [{ ...fixture.sources[0], license: "WTFPL" }],
    });
    expect(parseCorpusManifest(raw, "c")._tag).toBe("err");
  });

  it("rejects a short commit hash", () => {
    const raw = JSON.stringify({
      ...fixture,
      sources: [{ ...fixture.sources[0], commit: "abc123" }],
    });
    expect(parseCorpusManifest(raw, "c")._tag).toBe("err");
  });

  it("rejects duplicate source names", () => {
    const raw = JSON.stringify({
      ...fixture,
      sources: [fixture.sources[0], { ...fixture.sources[0], snapshot: "upstream/other/bb" }],
    });
    const result = parseCorpusManifest(raw, "c");
    expect(result._tag).toBe("err");
    if (result._tag !== "err") return;
    expect(result.error.issues).toContainEqual({
      path: "sources[1].name",
      message: "duplicate source 'example-skills'",
    });
  });

  it("rejects a vendored skill naming an unpinned source", () => {
    const raw = JSON.stringify({
      ...fixture,
      skills: [
        {
          name: "grilling",
          kind: "habit",
          upstream: { family: "nope", name: "grilling", path: "skills/grilling" },
        },
      ],
    });
    const result = parseCorpusManifest(raw, "c");
    expect(result._tag).toBe("err");
    if (result._tag !== "err") return;
    expect(result.error.issues).toContainEqual({
      path: "skills[0].upstream.family",
      message: "unknown source 'nope'",
    });
  });

  it("accepts a dot-leading upstream provenance path", () => {
    const raw = JSON.stringify({
      ...fixture,
      skills: [
        {
          name: "grilling",
          kind: "habit",
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
          kind: "habit",
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
          kind: "habit",
          upstream: { family: "example-skills", name: "x", path: "skills/x" },
        },
        {
          name: "a",
          kind: "habit",
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

  it("parses a native entry as one without an upstream, and refuses the old chain's ledger pin", () => {
    const native = { name: "router", kind: "start" };
    const raw = JSON.stringify({
      ...fixture,
      skills: [...fixture.skills, native],
      intents: [{ intent: "Shape a change", skills: ["grilling", "router"] }],
    });
    const result = parseCorpusManifest(raw, "c");
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    const router = result.value.skills.find((skill) => skill.name === "router");
    expect(router).toEqual(native);
    expect(router !== undefined && isVendored(router)).toBe(false);
    const pinned = JSON.stringify({
      ...fixture,
      skills: [{ ...native, ledger: { id: "baseline", revision: "a".repeat(64) } }],
      intents: [{ intent: "Shape a change", skills: ["router"] }],
    });
    expect(parseCorpusManifest(pinned, "c")._tag).toBe("err");
  });
});
