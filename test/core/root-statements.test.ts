import { describe, expect, it } from "vitest";
import {
  parseRootStatements,
  rootLanguages,
  type RootStatement,
} from "../../src/core/root-statements.ts";
import type { Vocabulary } from "../../src/core/cabinet.ts";

const vocabulary: Vocabulary = {
  language: [],
  purpose: [],
  technology: [],
  task: [],
  concern: [],
  kind: [],
  responsibility: ["api framework"],
};

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
  it("G3 refuses an unknown group prohibition instead of silently prohibiting nothing", () => {
    const result = parseRootStatements(
      JSON.stringify([
        { ...web, exclusions: [{ kind: "option-group", responsibility: "api framwork" }] },
      ]),
      "DECISIONS.md",
      vocabulary,
    );
    expect(result._tag).toBe("err");
    if (result._tag === "err")
      expect(result.error.issues).toEqual([
        { path: "[0].exclusions[0].responsibility", message: "unknown responsibility" },
      ]);
  });
  it.each(["../outside", "apps/../web", "/outside", "C:/outside", "apps\\web", ""])(
    "G3 refuses unconfined root %s with a located error",
    (root) => {
      const result = parseRootStatements(
        JSON.stringify([{ ...web, root }]),
        "DECISIONS.md",
        vocabulary,
      );
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
      vocabulary,
    );
    expect(adoption._tag).toBe("err");
    if (adoption._tag === "err") expect(adoption.error.issues[0]?.message).toContain("adopted");
    const exclusion = parseRootStatements(
      JSON.stringify([{ ...web, exclusions: [{ kind: "unit" }] }]),
      "DECISIONS.md",
      vocabulary,
    );
    expect(exclusion._tag).toBe("err");
    if (exclusion._tag === "err")
      expect(exclusion.error.issues[0]?.path).toBe("[0].exclusions[0].id");
  });
  it("G3 accepts no statements as unknown scope and refuses malformed input", () => {
    expect(parseRootStatements("[]", "DECISIONS.md", vocabulary)).toEqual({
      _tag: "ok",
      value: [],
    });
    const result = parseRootStatements("[broken", "DECISIONS.md", vocabulary);
    expect(result._tag).toBe("err");
    if (result._tag === "err") expect(result.error.source).toBe("DECISIONS.md");
  });
  it("G3 refuses competing statements for the same root instead of picking a winner", () => {
    const result = parseRootStatements(
      JSON.stringify([web, { ...web, technologies: ["eslint"] }]),
      "DECISIONS.md",
      vocabulary,
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
    expect(parseRootStatements(JSON.stringify([web, child]), "DECISIONS.md", vocabulary)).toEqual({
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
