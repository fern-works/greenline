import { describe, expect, it } from "vitest";
import { findBrokenReferences, type LinkableFile } from "../../src/core/links.ts";

describe("findBrokenReferences", () => {
  it("flags a same-directory link that does not resolve", () => {
    const broken = findBrokenReferences([
      { path: ".agents/skills/tdd/SKILL.md", content: "See [tests](tests.md)." },
    ]);
    expect(broken).toEqual([{ file: ".agents/skills/tdd/SKILL.md", target: "tests.md" }]);
  });

  it("accepts a resolving link, including ./ prefixed", () => {
    const files: readonly LinkableFile[] = [
      {
        path: ".claude/skills/tdd/SKILL.md",
        content: "See [tests](./tests.md) and [mocks](mocking.md).",
      },
      { path: ".claude/skills/tdd/tests.md", content: "x" },
      { path: ".claude/skills/tdd/mocking.md", content: "y" },
    ];
    expect(findBrokenReferences(files)).toEqual([]);
  });

  it("ignores external links, anchors, and placeholders", () => {
    const broken = findBrokenReferences([
      {
        path: "a/SKILL.md",
        content: "[web](https://x.test/a.md) [mail](mailto:a@b.test) [jump](#sec) [x](link)",
      },
    ]);
    expect(broken).toEqual([]);
  });

  it("ignores links into the surrounding project", () => {
    const broken = findBrokenReferences([
      {
        path: "skills/domain-modeling/CONTEXT-FORMAT.md",
        content: "[o](./src/ordering/CONTEXT.md)",
      },
    ]);
    expect(broken).toEqual([]);
  });

  it("checks support files too and strips anchors before resolving", () => {
    const broken = findBrokenReferences([{ path: "s/SKILL.md", content: "[a](GUIDE.md#top)" }]);
    expect(broken).toEqual([{ file: "s/SKILL.md", target: "GUIDE.md" }]);
  });

  // Template files describe the repo the consumer will create, not the
  // projection: their links intentionally point at files that do not
  // exist here (QA run 041 — four GL0114 warnings on every doctor run).
  it("skips -template.md files whose links describe the target repo", () => {
    const broken = findBrokenReferences([
      {
        path: ".claude/skills/product-description/references/README-template.md",
        content: "See the [glossary](glossary.md) for terms.",
      },
    ]);
    expect(broken).toEqual([]);
  });

  it("skips {placeholder} link targets anywhere", () => {
    const broken = findBrokenReferences([
      {
        path: ".claude/skills/product-description/references/verification-template.md",
        content: "One file per cluster: [{cluster}]({cluster}.md).",
      },
      { path: "s/SKILL.md", content: "fill in [{name}]({name}.md) later" },
    ]);
    expect(broken).toEqual([]);
  });

  it("still flags a dangling reference in a non-template file", () => {
    const broken = findBrokenReferences([
      { path: "s/SKILL.md", content: "[gone](missing.md)" },
      { path: "s/other-template-notes.md", content: "[gone](missing.md)" },
    ]);
    expect(broken).toEqual([
      { file: "s/SKILL.md", target: "missing.md" },
      { file: "s/other-template-notes.md", target: "missing.md" },
    ]);
  });
});
