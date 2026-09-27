import { describe, expect, it } from "vitest";
import {
  parseRootStatements,
  rootExclusionSubjects,
  rootLanguages,
  type RootStatement,
} from "../../src/core/root-statements.ts";

const web = {
  root: "apps/web",
  purpose: "web application",
  languages: ["typescript"],
  technologies: ["biome", "a-tool-not-in-the-corpus"],
  decision: "#web-stack",
  exclusions: [
    { kind: "unit", id: "typescript-example-rule" },
    { kind: "option-group", responsibility: "api framework" },
  ],
};

describe("G3 root statements", () => {
  it.each(["../outside", "apps/../web", "/outside", "C:/outside", "apps\\web", ""])(
    "G3 refuses unconfined root %s with a located error",
    (root) => {
      const result = parseRootStatements(JSON.stringify([{ ...web, root }]), "DECISIONS.md");
      expect(result._tag).toBe("err");
      if (result._tag === "err")
        expect(result.error.issues).toEqual([
          { path: "[0].root", message: "a repository-relative root" },
        ]);
    },
  );
  it("G3 refuses guidance adoption fields and incomplete exclusions", () => {
    const adoption = parseRootStatements(
      JSON.stringify([{ ...web, adopted: ["typescript-example-rule"] }]),
      "DECISIONS.md",
    );
    expect(adoption._tag).toBe("err");
    if (adoption._tag === "err") expect(adoption.error.issues[0]?.message).toContain("adopted");
    const exclusion = parseRootStatements(
      JSON.stringify([{ ...web, exclusions: [{ kind: "unit" }] }]),
      "DECISIONS.md",
    );
    expect(exclusion._tag).toBe("err");
    if (exclusion._tag === "err")
      expect(exclusion.error.issues[0]?.path).toBe("[0].exclusions[0].id");
  });
  it("G3 accepts no statements as unknown scope and refuses malformed input", () => {
    expect(parseRootStatements("[]", "DECISIONS.md")).toEqual({
      _tag: "ok",
      value: [],
    });
    const result = parseRootStatements("[broken", "DECISIONS.md");
    expect(result._tag).toBe("err");
    if (result._tag === "err") expect(result.error.source).toBe("DECISIONS.md");
  });
  it("G3 refuses competing statements for the same root instead of picking a winner", () => {
    const result = parseRootStatements(
      JSON.stringify([web, { ...web, technologies: ["eslint"] }]),
      "DECISIONS.md",
    );
    expect(result._tag).toBe("err");
    if (result._tag === "err")
      expect(result.error.issues).toEqual([
        { path: "[1].root", message: "duplicate governed root" },
      ]);
  });
  it("G3 preserves independent nested roots and unknown choices without deriving inheritance", () => {
    const child = {
      root: "apps/web/scripts",
      purpose: null,
      languages: [],
      technologies: [],
      decision: "#scripts-unsettled",
      exclusions: [],
    };
    expect(parseRootStatements(JSON.stringify([web, child]), "DECISIONS.md")).toEqual({
      _tag: "ok",
      value: [web, child],
    });
  });
});

describe("G3 root languages", () => {
  const settled = (root: string, languages: readonly string[]): RootStatement => ({
    root,
    purpose: null,
    languages,
    technologies: [],
    decision: "#stack",
    exclusions: [],
  });

  it("R3.3 unions the languages the named roots settled, sorted and without repeats", () => {
    expect(
      rootLanguages(
        [settled("apps/api", ["typescript", "go"]), settled("apps/web", ["typescript"])],
        ["apps/web", "apps/api"],
      ),
    ).toEqual(["go", "typescript"]);
  });

  it("R3.3 takes no language from a root the call did not name", () => {
    expect(
      rootLanguages(
        [settled("apps/api", ["go"]), settled("apps/web", ["typescript"])],
        ["apps/api"],
      ),
    ).toEqual(["go"]);
  });

  it("R3.3 derives no language when the named roots declare none", () => {
    expect(
      rootLanguages([settled("apps/api", []), settled("apps/web", ["typescript"])], ["apps/api"]),
    ).toEqual([]);
  });
});

describe("the exclusions a read's governed roots declare", () => {
  it("collects the named roots' own exclusions, sorted once each, and never a sibling's or a parent's", () => {
    const parsed = parseRootStatements(
      JSON.stringify([
        web,
        { ...web, root: "apps/api", exclusions: [{ kind: "unit", id: "api-only-rule" }] },
        {
          ...web,
          root: ".",
          exclusions: [{ kind: "option-group", responsibility: "root-wide choice" }],
        },
      ]),
      "fence",
    );
    if (parsed._tag === "err") throw parsed.error;
    expect(rootExclusionSubjects(parsed.value, ["apps/web"])).toEqual({
      units: ["typescript-example-rule"],
      groups: ["api framework"],
    });
    expect(rootExclusionSubjects(parsed.value, ["apps/web", "apps/api", "apps/web"])).toEqual({
      units: ["api-only-rule", "typescript-example-rule"],
      groups: ["api framework"],
    });
    expect(rootExclusionSubjects(parsed.value, ["apps/other"])).toEqual({ units: [], groups: [] });
  });
});
