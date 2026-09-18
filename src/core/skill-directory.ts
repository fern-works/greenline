import { z } from "zod";
import { err, ok, type Result } from "../commons/result.ts";
import { parseJson } from "./contract.ts";
import type { ActivationMode, SkillClass, SkillFile, SkillSource } from "./skill.ts";

const stringSchema = z.string();

/**
 * A roster skill is one directory (`corpus/skills/<name>/`, ADR 0039):
 * `SKILL.md` with its frontmatter and body, and every other file as a
 * support file, verbatim. Nothing composes at build time; a vendored
 * copy was edited by hand and its differences from upstream are
 * measured by the divergence ledger, not declared here.
 */

class SkillDirectoryFailed extends Error {
  readonly _tag = "SkillDirectoryFailed" as const;
  readonly skill: string;
  constructor(skill: string, message: string) {
    super(`reading skill '${skill}' failed: ${message}`);
    this.skill = skill;
  }
}

/** The two frontmatter fields every SKILL.md carries. */
export interface SkillFrontmatter {
  readonly name: string;
  readonly description: string;
}

/**
 * Parse the leading `---` frontmatter block and return it with the body
 * that follows (one leading blank line stripped). Values may be plain
 * scalars, double-quoted scalars (unwrapped and unescaped), or block
 * scalars (`>` folded to one line, `|` kept as lines): the shapes the
 * copies and their upstreams actually use.
 */
export function parseSkillFrontmatter(
  content: string,
  skill: string,
): Result<{ readonly frontmatter: SkillFrontmatter; readonly body: string }, SkillDirectoryFailed> {
  if (!content.startsWith("---\n")) {
    return err(new SkillDirectoryFailed(skill, "SKILL.md does not start with frontmatter"));
  }
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) {
    return err(new SkillDirectoryFailed(skill, "SKILL.md frontmatter is not closed"));
  }
  const lines = content.slice(4, end).split("\n");
  const fields = new Map<string, string>();
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([A-Za-z][\w-]*):\s?(.*)$/.exec(lines[index] ?? "");
    const key = match?.[1];
    if (key === undefined || match?.[2] === undefined) continue;
    let raw = match[2].trim();
    if (raw === ">" || raw === ">-" || raw === "|" || raw === "|-") {
      const block: string[] = [];
      while (/^\s+\S/.test(lines[index + 1] ?? "")) {
        index += 1;
        block.push((lines[index] ?? "").trim());
      }
      raw = block.join(raw.startsWith(">") ? " " : "\n");
    } else if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
      // A quoted scalar is JSON-compatible; one that fails to parse
      // keeps its raw bytes rather than dropping the field.
      const unquoted = stringSchema.safeParse(parseJson(raw));
      if (unquoted.success) raw = unquoted.data;
    }
    fields.set(key, raw);
  }
  const name = fields.get("name");
  const description = fields.get("description");
  if (name === undefined || name.length === 0) {
    return err(new SkillDirectoryFailed(skill, "frontmatter has no name"));
  }
  if (description === undefined || description.length === 0) {
    return err(new SkillDirectoryFailed(skill, "frontmatter has no description"));
  }
  const rawBody = content.slice(end + "\n---\n".length);
  const body = rawBody.startsWith("\n") ? rawBody.slice(1) : rawBody;
  return ok({ frontmatter: { name, description }, body });
}

/** Files the renderer generates itself; a copy never carries one. */
const GENERATED_FILES: ReadonlySet<string> = new Set(["agents/openai.yaml"]);

/**
 * Read one skill from its directory files. The frontmatter name must
 * equal the roster name; every file but `SKILL.md` is a support file,
 * byte-as-authored; a generated file inside the copy is refused.
 */
export function skillFromDirectory(
  entry: {
    readonly name: string;
    readonly class: SkillClass;
    readonly activation: ActivationMode;
    readonly optIn?: true | undefined;
  },
  files: readonly SkillFile[],
): Result<SkillSource, SkillDirectoryFailed> {
  const skillMd = files.find((file) => file.path === "SKILL.md");
  if (skillMd === undefined) {
    return err(new SkillDirectoryFailed(entry.name, "directory has no SKILL.md"));
  }
  const generated = files.find((file) => GENERATED_FILES.has(file.path));
  if (generated !== undefined) {
    return err(
      new SkillDirectoryFailed(entry.name, `'${generated.path}' is generated at render time`),
    );
  }
  const parsed = parseSkillFrontmatter(skillMd.content, entry.name);
  if (parsed._tag === "err") return err(parsed.error);
  if (parsed.value.frontmatter.name !== entry.name) {
    return err(
      new SkillDirectoryFailed(
        entry.name,
        `frontmatter name '${parsed.value.frontmatter.name}' does not match the roster name`,
      ),
    );
  }
  const supportFiles = files
    .filter((file) => file.path !== "SKILL.md")
    .map((file) => ({ path: file.path, content: file.content }));
  const source: SkillSource = {
    name: entry.name,
    description: parsed.value.frontmatter.description,
    class: entry.class,
    activation: entry.activation,
    body: parsed.value.body,
    supportFiles,
  };
  return ok(entry.optIn === undefined ? source : { ...source, optIn: entry.optIn });
}
