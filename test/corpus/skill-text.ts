/** How the rules tests read a corpus page as an agent reads it (J-180 S1). */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A corpus page's text with its line breaks and runs of spaces read as one
 * space. A skill's `SKILL.md` is read with its method page, `method.md`,
 * where J-180 S1 moved every sentence past the front: the front points
 * there at the moment the sentence is needed, so the skill says what either
 * page says.
 * @param repository the repository's root
 * @param path the page's path under `corpus/`
 * @returns the text, its white space folded
 */
export function corpusPage(repository: string, path: string): string {
  const text = readFileSync(join(repository, "corpus", path), "utf8");
  const method = path.replace(/SKILL\.md$/, "method.md");
  const moved =
    method !== path && existsSync(join(repository, "corpus", method))
      ? readFileSync(join(repository, "corpus", method), "utf8")
      : "";
  return `${text}\n${moved}`.replace(/\s+/g, " ");
}
