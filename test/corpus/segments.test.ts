/** The segmenter and the joiner (`src/corpus/segments.ts`), on the frozen text and on small cases. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { joinSegments, segmentProse } from "../../src/corpus/segments.ts";

const corpus = join(import.meta.dirname, "..", "..", "corpus");

function proseFiles(directory: string): readonly string[] {
  return readdirSync(join(corpus, directory), { recursive: true })
    .map(String)
    .filter((path) => path.endsWith(".md"))
    .map((path) => join(directory, path));
}

/** Each segment as kind, lead and text. */
function pieces(text: string): readonly (readonly [string, string, string])[] {
  return segmentProse(text).segments.map((segment) => [segment.kind, segment.lead, segment.text]);
}

describe("the round trip", () => {
  it("re-joins all 465 frozen prose files under corpus/upstream/ and corpus/skills/ exactly", () => {
    const files = [...proseFiles("upstream"), ...proseFiles("skills")];
    // 288 snapshot pages and 130 roster pages. S21 left 115 and 124 (158 when
    // the segmenter landed, less the 34 provenance pages S21 removed); R2's
    // refresh added addyosmani's 31 and superpowers' 60 pages and
    // diagram-design's six new references, upstream and in the roster; R3's
    // intake added the 75 pages of the shortlisted skills at their pins and
    // pstack's comment-sicko agent file. S13 took eight roster pages away
    // with the six skills it retired and added frame's five and plan's one,
    // leaving 128 roster pages. S14 took seven away with implement,
    // record-architecture-decisions and domain-modeling and added
    // anticipate's one, build's one and close's four, leaving 127. S15 took
    // seven away with the six skills it retired and added review's four and
    // verify's three, leaving 127. S18a took twelve away with the ten habits
    // it retired and added fourteen: tdd's bug-fix page, ponytail's two,
    // deep-modules' three, concurrency's two, prose's three, and one each for
    // domain-and-types, boundaries and secrets, leaving 129. S18b added the
    // five trial habits' pages, one each, leaving 134. J-65 S3 added review's
    // reviewer's brief page, references/brief.md. J-93 S1 added each of the
    // seven steps' references page, references/greenline.md.
    // J-93 S2 added 22 references pages, one per start and habit that carries a mechanic.
    expect(files.length).toBe(465);
    const broken = files.filter((path) => {
      const text = readFileSync(join(corpus, path), "utf8");
      return joinSegments(segmentProse(text)) !== text;
    });
    expect(broken).toEqual([]);
  });

  it("gives every segment of the frozen text content that neither starts nor ends with white space", () => {
    const loose = [...proseFiles("upstream"), ...proseFiles("skills")].flatMap((path) =>
      segmentProse(readFileSync(join(corpus, path), "utf8"))
        .segments.filter((segment) => segment.text === "" || segment.text.trim() !== segment.text)
        .map((segment) => `${path}: ${segment.id}`),
    );
    expect(loose).toEqual([]);
  });
});

describe("the separator rule", () => {
  it("keeps the front matter whole and splits a heading, a paragraph's sentences and a table's rows", () => {
    const text = "---\nname: x\n---\n\n## Title ##\n\nOne. Two!\n\n| a | b |\n|---|---|\n";
    const file = segmentProse(text);
    expect(file.frontMatter).toBe("---\nname: x\n---\n");
    expect(pieces(text)).toEqual([
      ["heading", "", "## Title ##"],
      ["sentence", "", "One."],
      ["sentence", "", "Two!"],
      ["row", "", "| a | b |"],
      ["row", "", "|---|---|"],
    ]);
    expect(file.segments.map((segment) => segment.separator)).toEqual([
      "\n",
      "\n\n",
      " ",
      "\n\n",
      "\n",
    ]);
    expect(file.trailer).toBe("\n");
  });

  it("makes a list marker and its indentation separator, carried as the lead of the item's first sentence", () => {
    expect(pieces("- First item. Still first.\n  1. Nested item\n* Third\n")).toEqual([
      ["sentence", "- ", "First item."],
      ["sentence", "", "Still first."],
      ["sentence", "  1. ", "Nested item"],
      ["sentence", "* ", "Third"],
    ]);
  });

  it("keeps a whole code fence as one segment, sentences inside it included", () => {
    const fence = "```ts\nconst a = 1. Then b;\n\nmore();\n```";
    expect(pieces(`Before.\n\n  ${fence.replaceAll("\n", "\n  ")}\nAfter.\n`)).toEqual([
      ["sentence", "", "Before."],
      ["fence", "  ", fence.replaceAll("\n", "\n  ")],
      ["sentence", "", "After."],
    ]);
  });

  it("treats a horizontal rule and quote markers as separators and keeps a line break inside a sentence", () => {
    expect(pieces("> Quoted start\n> of one sentence. Second.\n\n---\n\nEnd.\n")).toEqual([
      ["sentence", "> ", "Quoted start\n> of one sentence."],
      ["sentence", "", "Second."],
      ["sentence", "", "End."],
    ]);
  });
});

describe("the sentence rule", () => {
  it("does not end a sentence at a named abbreviation, inside inline code, or before a letter", () => {
    expect(pieces("Use a seam, e.g. a port. Run `a. b` now. See SKILL.md first.\n")).toEqual([
      ["sentence", "", "Use a seam, e.g. a port."],
      ["sentence", "", "Run `a. b` now."],
      ["sentence", "", "See SKILL.md first."],
    ]);
  });

  it("carries closing quotes and emphasis with the punctuation they follow", () => {
    expect(pieces('**Red first.** Then "green?" Last\n')).toEqual([
      ["sentence", "", "**Red first.**"],
      ["sentence", "", 'Then "green?"'],
      ["sentence", "", "Last"],
    ]);
  });
});

describe("segment ids", () => {
  it("names a segment by the first twelve hex of its content's sha256 and a later duplicate with #2", () => {
    // printf '# Fixture method' | shasum -a 256 begins c698f9a8efd8.
    const ids = segmentProse("# Fixture method\n\nSame. Same.\n").segments.map(
      (segment) => segment.id,
    );
    expect(ids[0]).toBe("c698f9a8efd8");
    expect(ids[2]).toBe(`${String(ids[1])}#2`);
  });

  it("keeps every other segment's id when an unrelated sentence of the same file changes", () => {
    const before = "# Title\n\nFirst sentence. Second sentence.\n\n- An item.\n";
    const after = before.replace("Second sentence.", "A rewritten sentence, longer than before.");
    const ids = (text: string): readonly string[] =>
      segmentProse(text).segments.map((segment) => segment.id);
    const [title, first, second, item] = ids(before);
    const changed = ids(after);
    expect([changed[0], changed[1], changed[3]]).toEqual([title, first, item]);
    expect(changed[2]).not.toBe(second);
  });
});
