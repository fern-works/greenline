import { describe, expect, it } from "vitest";
import {
  bodyLines,
  fieldData,
  parseFieldLines,
  parseFrontMatter,
} from "../../src/core/front-matter.ts";

describe("the front-matter dialect", () => {
  it("S3 a document gives its fields, its body and the line the body starts on", () => {
    const parsed = parseFrontMatter('---\nmode: fast\nwhy: "a typo"\n---\n\n## build\n', "record");
    if (parsed._tag === "err") throw parsed.error;
    expect([...parsed.value.fields]).toEqual([
      ["mode", "fast"],
      ["why", "a typo"],
    ]);
    expect(parsed.value.body).toBe("\n## build\n");
    expect(parsed.value.bodyLine).toBe(5);
  });

  it("S3 the refusal of a document with no front matter names the document's kind", () => {
    expect(parseFrontMatter("# Notes\n", "change record")).toEqual({
      _tag: "err",
      error: expect.objectContaining({
        issues: [{ path: "", message: "change record must start with a '---' frontmatter block" }],
      }),
    });
  });

  it("S3 a block that is never closed is refused after its own issues", () => {
    expect(parseFrontMatter("---\nmode fast\n", "record")).toEqual({
      _tag: "err",
      error: expect.objectContaining({
        issues: [
          { path: "", message: "line 2: unsupported frontmatter line 'mode fast'" },
          { path: "", message: "line 3: blank lines are not allowed in frontmatter" },
          { path: "", message: "frontmatter block is not closed with a '---' line" },
        ],
      }),
    });
  });

  it("S3 field lines outside a block parse alone, numbered from their place in the file", () => {
    expect(parseFieldLines(["mode: high", "after:", "  - t1"], 12)).toEqual({
      _tag: "ok",
      value: new Map<string, unknown>([
        ["mode", "high"],
        ["after", [{ kind: "scalar", value: "t1" }]],
      ]),
    });
    expect(parseFieldLines(["mode: high", "mode: max"], 12)).toEqual({
      _tag: "err",
      error: expect.objectContaining({
        issues: [{ path: "mode", message: "duplicate field 'mode'" }],
      }),
    });
    expect(parseFieldLines(["  - t1"], 12)).toEqual({
      _tag: "err",
      error: expect.objectContaining({
        issues: [{ path: "", message: "line 12: list item outside a 'key:' list" }],
      }),
    });
  });

  it("S3 the fields read as plain data: scalars, lists, flow maps as objects and task items", () => {
    const parsed = parseFieldLines(
      [
        "state: open",
        "agents: 2",
        "floors: [security, concurrency]",
        "raises:",
        '  - { from: fast, reason: "a public contract" }',
        "acceptance:",
        "  - [x] the build passes",
        "  - [ ] the docs move",
      ],
      2,
    );
    if (parsed._tag === "err") throw parsed.error;
    expect(fieldData(parsed.value)).toEqual({
      state: "open",
      agents: 2,
      floors: ["security", "concurrency"],
      raises: [{ from: "fast", reason: "a public contract" }],
      acceptance: [
        { task: "the build passes", done: true },
        { task: "the docs move", done: false },
      ],
    });
  });

  it("S20 a flat list reads as the same list written long, and an empty one as no items", () => {
    const flat = parseFieldLines(["after: [t1, t2]", "floors: []"], 2);
    if (flat._tag === "err") throw flat.error;
    expect(fieldData(flat.value)).toEqual({ after: ["t1", "t2"], floors: [] });
    const long = parseFieldLines(["after:", "  - t1", "  - t2"], 2);
    if (long._tag === "err") throw long.error;
    expect(fieldData(long.value)).toEqual({ after: ["t1", "t2"] });
  });

  it("S20 an indented line that is no list item is refused, with its line", () => {
    const parsed = parseFrontMatter(
      "---\nmode: fast\n    nested:\n      deep: true\n---\n",
      "record",
    );
    expect(parsed._tag).toBe("err");
    if (parsed._tag !== "err") return;
    expect(parsed.error.issues.map((issue) => issue.path)).toEqual(["", ""]);
    expect(parsed.error.issues[0]?.message).toMatch(/^line 3: /);
  });

  it("S3 a quoted flow-map value may hold a comma and a space", () => {
    const line = ["raises:", '  - { from: fast, reason: "a contract, and its callers" }'];
    const quoted = parseFieldLines(line, 2);
    if (quoted._tag === "err") throw quoted.error;
    expect(fieldData(quoted.value)).toEqual({
      raises: [{ from: "fast", reason: "a contract, and its callers" }],
    });
  });
});

describe("a record's body lines", () => {
  it("S3 lines inside a backtick or tilde fence are marked fenced, the fences included", () => {
    const body = [
      "## build",
      "```md",
      "## not a step",
      "```",
      "~~~",
      "### not a round",
      "~~~",
      "### Round 1",
    ];
    expect(bodyLines(body.join("\n")).map((line) => line.fenced)).toEqual([
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it("S3 a fence closes only on its own marker, and an unclosed fence runs to the end", () => {
    const body = ["~~~", "```", "## still fenced", "~~~", "## free", "```", "## open to the end"];
    expect(bodyLines(body.join("\n")).map((line) => line.fenced)).toEqual([
      true,
      true,
      true,
      true,
      false,
      true,
      true,
    ]);
  });

  it("S3 a four-backtick fence holds a three-backtick line, and closes on a run at least as long", () => {
    const body = [
      "````md",
      "```",
      "## quoted heading",
      "```",
      "````",
      "## free",
      "~~~~",
      "~~~",
      "~~~~~",
      "## free again",
    ];
    expect(bodyLines(body.join("\n")).map((line) => line.fenced)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      false,
    ]);
  });

  it("S3 a fence closes only on a line holding nothing but its run", () => {
    const body = ["```", "```ts", "## still fenced", "```", "## free"];
    expect(bodyLines(body.join("\n")).map((line) => line.fenced)).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
  });
});
