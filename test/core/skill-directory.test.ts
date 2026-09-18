import { describe, expect, it } from "vitest";
import { parseSkillFrontmatter, skillFromDirectory } from "../../src/core/skill-directory.ts";
import type { SkillFile } from "../../src/core/skill.ts";

const entry = {
  name: "delivery-review",
  class: "stage" as const,
  activation: "explicit" as const,
};

function directory(skillMd: string, extra: readonly SkillFile[] = []): readonly SkillFile[] {
  return [{ path: "SKILL.md", content: skillMd }, ...extra];
}

describe("parseSkillFrontmatter", () => {
  it("unwraps a quoted description, including escaped quotes, and strips one leading blank line", () => {
    const result = parseSkillFrontmatter(
      '---\nname: "delivery-review"\ndescription: "Review the diff, or \\"review since X\\"."\n---\n\nbody\n',
      "delivery-review",
    );
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    expect(result.value.frontmatter).toEqual({
      name: "delivery-review",
      description: 'Review the diff, or "review since X".',
    });
    expect(result.value.body).toBe("body\n");
  });

  it("joins a folded block-scalar description into one line and keeps a plain scalar name", () => {
    const result = parseSkillFrontmatter(
      "---\nname: delivery-review\ndescription: >\n  Code review focused\n  on over-engineering.\n---\n\nbody",
      "delivery-review",
    );
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    expect(result.value.frontmatter.description).toBe("Code review focused on over-engineering.");
  });

  it("fails closed without frontmatter, without a name, or without a description", () => {
    expect(parseSkillFrontmatter("no frontmatter", "x")._tag).toBe("err");
    expect(parseSkillFrontmatter("---\ndescription: d\n---\n\nbody", "x")._tag).toBe("err");
    expect(parseSkillFrontmatter("---\nname: x\n---\n\nbody", "x")._tag).toBe("err");
    expect(parseSkillFrontmatter("---\nname: x\ndescription: d\n", "x")._tag).toBe("err");
  });
});

describe("skillFromDirectory", () => {
  it("reads the copy as installed: frontmatter description, body verbatim, every other file as support", () => {
    const result = skillFromDirectory(
      entry,
      directory(
        '---\nname: "delivery-review"\ndescription: "Review the diff."\n---\n\n# Review\n\nRead the range.\n',
        [
          { path: "REGISTER.md", content: "Red flags." },
          { path: "bin/run.sh", content: "echo /code-review" },
        ],
      ),
    );
    expect(result._tag).toBe("ok");
    if (result._tag !== "ok") return;
    expect(result.value).toEqual({
      name: "delivery-review",
      description: "Review the diff.",
      class: "stage",
      activation: "explicit",
      body: "# Review\n\nRead the range.\n",
      supportFiles: [
        { path: "REGISTER.md", content: "Red flags." },
        { path: "bin/run.sh", content: "echo /code-review" },
      ],
    });
  });

  it("carries the opt-in tag only when the entry sets it", () => {
    const files = directory('---\nname: "delivery-review"\ndescription: "d"\n---\n\nbody');
    const plain = skillFromDirectory(entry, files);
    const tagged = skillFromDirectory({ ...entry, optIn: true }, files);
    expect(plain._tag === "ok" && plain.value.optIn).toBeUndefined();
    expect(tagged._tag === "ok" && tagged.value.optIn).toBe(true);
  });

  it("refuses a frontmatter name that differs from the roster name", () => {
    const result = skillFromDirectory(
      entry,
      directory('---\nname: "code-review"\ndescription: "d"\n---\n\nbody'),
    );
    expect(result._tag).toBe("err");
    if (result._tag !== "err") return;
    expect(result.error.message).toContain("does not match the roster name");
  });

  it("refuses a directory without SKILL.md and a copy carrying a generated file", () => {
    expect(skillFromDirectory(entry, [{ path: "other.md", content: "x" }])._tag).toBe("err");
    const generated = skillFromDirectory(
      entry,
      directory('---\nname: "delivery-review"\ndescription: "d"\n---\n\nbody', [
        { path: "agents/openai.yaml", content: "interface: {}" },
      ]),
    );
    expect(generated._tag).toBe("err");
    if (generated._tag !== "err") return;
    expect(generated.error.message).toContain("generated at render time");
  });
});
