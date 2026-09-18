import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { diffLines, hunksBetween, splitLines, type LineEdit } from "../../src/core/diff.ts";

/** Replay a script over `before`; a step that disagrees with `before` is the bug. */
function apply(before: readonly string[], edits: readonly LineEdit[]): readonly string[] {
  const out: string[] = [];
  let index = 0;
  for (const edit of edits) {
    if (edit.kind === "added") {
      out.push(edit.line);
      continue;
    }
    expect(before[index]).toBe(edit.line);
    if (edit.kind === "equal") out.push(edit.line);
    index += 1;
  }
  expect(index).toBe(before.length);
  return out;
}

describe("diffLines", () => {
  it("equal inputs yield only equal steps", () => {
    const lines = ["alpha", "beta", "gamma"];
    expect(diffLines(lines, [...lines])).toEqual([
      { kind: "equal", line: "alpha" },
      { kind: "equal", line: "beta" },
      { kind: "equal", line: "gamma" },
    ]);
  });

  it("lists a removal before the addition that replaces it", () => {
    expect(diffLines(["old"], ["new"])).toEqual([
      { kind: "removed", line: "old" },
      { kind: "added", line: "new" },
    ]);
  });

  it("finds the shortest script rather than rewriting shifted lines", () => {
    expect(diffLines(["a", "b", "c"], ["x", "a", "b", "c"])).toEqual([
      { kind: "added", line: "x" },
      { kind: "equal", line: "a" },
      { kind: "equal", line: "b" },
      { kind: "equal", line: "c" },
    ]);
  });

  it("replays before into after over every fixture", () => {
    const fixtures: readonly (readonly [readonly string[], readonly string[]])[] = [
      [[], []],
      [[], ["only", "after"]],
      [["only", "before"], []],
      [
        ["a", "b", "c"],
        ["a", "b", "c"],
      ],
      [
        ["a", "b", "c"],
        ["x", "y", "z"],
      ],
      [
        ["a", "b", "c", "d"],
        ["a", "c", "b", "d"],
      ],
      [
        ["same", "same", "same"],
        ["same", "same"],
      ],
      [
        ["head", "old", "tail"],
        ["head", "new", "new", "tail"],
      ],
      [
        ["x", "", "y", "", "x"],
        ["", "x", "y", "x", ""],
      ],
      [
        ["a", "b", "c", "a", "b", "b", "a"],
        ["c", "b", "a", "b", "a", "c"],
      ],
    ];
    for (const [before, after] of fixtures)
      expect(apply(before, diffLines(before, after))).toEqual(after);
  });
});

describe("splitLines", () => {
  it("a trailing newline adds no empty last line", () => {
    expect(splitLines("one\ntwo\n")).toEqual(["one", "two"]);
    expect(splitLines("one\ntwo")).toEqual(["one", "two"]);
    expect(splitLines("")).toEqual([]);
  });

  it("keeps an interior blank line and a second trailing newline", () => {
    expect(splitLines("one\n\ntwo\n\n")).toEqual(["one", "", "two", ""]);
  });
});

describe("hunksBetween", () => {
  const PATH = "SKILL.md";
  const base = "# Title\n\nfirst paragraph\n\nsecond paragraph\n\nthird paragraph\n";

  it("equal texts give no hunks", () => {
    expect(hunksBetween(PATH, base, base)).toEqual([]);
  });

  it("one changed line in the middle gives one changed hunk with that line on both sides", () => {
    const edited = base.replace("second paragraph", "second paragraph, revised");
    expect(hunksBetween(PATH, base, edited)).toEqual([
      {
        id: expect.stringMatching(/^h:[0-9a-f]{16}$/),
        path: PATH,
        kind: "changed",
        removed: ["second paragraph"],
        added: ["second paragraph, revised"],
      },
    ]);
  });

  it("two separate edits give two hunks in file order", () => {
    const edited = base
      .replace("first paragraph", "first paragraph, revised")
      .replace("third paragraph", "third paragraph, revised");
    const hunks = hunksBetween(PATH, base, edited);
    expect(hunks.map((hunk) => [hunk.removed, hunk.added])).toEqual([
      [["first paragraph"], ["first paragraph, revised"]],
      [["third paragraph"], ["third paragraph, revised"]],
    ]);
  });

  it("an edit elsewhere in the file leaves an existing hunk's id unchanged", () => {
    const edited = base.replace("third paragraph", "third paragraph, revised");
    const alone = hunksBetween(PATH, base, edited);
    const shifted = hunksBetween(
      PATH,
      base,
      edited.replace("first paragraph", "new intro\nmore intro\n\nfirst paragraph"),
    );
    expect(alone).toHaveLength(1);
    expect(shifted).toHaveLength(2);
    expect(shifted[1]?.id).toBe(alone[0]?.id);
  });

  it("trailing whitespace changes the raw lines but not the id", () => {
    const edited = base.replace("second paragraph", "second paragraph, revised");
    const clean = hunksBetween(PATH, base, edited);
    const padded = hunksBetween(
      PATH,
      base.replace("second paragraph", "second paragraph \t"),
      edited.replace("second paragraph, revised", "second paragraph, revised  "),
    );
    expect(padded[0]?.removed).toEqual(["second paragraph \t"]);
    expect(padded[0]?.added).toEqual(["second paragraph, revised  "]);
    expect(padded[0]?.id).toBe(clean[0]?.id);
  });

  it("the id is the documented digest of path, kind and normalized lines", () => {
    const [hunk] = hunksBetween(PATH, "keep\nold \n", "keep\nnew\t\n");
    const digest = createHash("sha256").update("SKILL.md\0changed\0old\0new").digest("hex");
    expect(hunk?.id).toBe(`h:${digest.slice(0, 16)}`);
  });

  it("a file present only after is one added hunk holding every line", () => {
    expect(hunksBetween(PATH, undefined, "one\ntwo\n")).toEqual([
      {
        id: expect.stringMatching(/^h:[0-9a-f]{16}$/),
        path: PATH,
        kind: "added",
        removed: [],
        added: ["one", "two"],
      },
    ]);
  });

  it("a file present only before is one removed hunk holding every line", () => {
    expect(hunksBetween(PATH, "one\ntwo\n", undefined)).toEqual([
      {
        id: expect.stringMatching(/^h:[0-9a-f]{16}$/),
        path: PATH,
        kind: "removed",
        removed: ["one", "two"],
        added: [],
      },
    ]);
  });

  it("a whole-file hunk is not confused with a changed hunk of the same lines", () => {
    const [wholeFile] = hunksBetween(PATH, undefined, "one\n");
    const [changed] = hunksBetween(PATH, "", "one\n");
    expect(changed?.kind).toBe("changed");
    expect(changed?.id).not.toBe(wholeFile?.id);
  });

  it("both sides absent give no hunks", () => {
    expect(hunksBetween(PATH, undefined, undefined)).toEqual([]);
  });

  it("two identical hunks in one file get #2 on the second", () => {
    const before = "a\nkeep\na\n";
    const after = "b\nkeep\nb\n";
    const ids = hunksBetween(PATH, before, after).map((hunk) => hunk.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toMatch(/^h:[0-9a-f]{16}$/);
    expect(ids[1]).toBe(`${ids[0]}#2`);
  });

  it("the same content under another path has another id", () => {
    const [here] = hunksBetween("a/SKILL.md", "old\n", "new\n");
    const [there] = hunksBetween("b/SKILL.md", "old\n", "new\n");
    expect(here?.id).not.toBe(there?.id);
  });
});
