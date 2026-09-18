/**
 * Reference integrity for rendered skills (`docs/SPEC.md` §6): a skill's
 * same-directory markdown links must resolve to files in the installed
 * projection. Links into the surrounding project (`./src/...`, bare
 * placeholders like `link`) describe the user's repository, not the
 * skill directory, and are out of scope. So are `*-template.md` files
 * and `{placeholder}` targets: a template's links describe the repo the
 * consumer will create from it, not the projection (QA run 041 charged
 * four standing false warnings to this check).
 */

export interface BrokenReference {
  readonly file: string;
  readonly target: string;
}

/** A markdown file whose links we can check. */
export interface LinkableFile {
  readonly path: string;
  readonly content: string;
}

const MARKDOWN_LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function basenameOf(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

function directoryOf(target: string): string {
  const cut = target.lastIndexOf("/");
  return cut === -1 ? "" : target.slice(0, cut + 1);
}

function isExternalOrAnchor(target: string): boolean {
  return (
    target.startsWith("http://") ||
    target.startsWith("https://") ||
    target.startsWith("mailto:") ||
    target.startsWith("#") ||
    target.startsWith("/")
  );
}

/**
 * Find every same-directory markdown link that does not resolve within
 * the provided file set. Deterministic: results are sorted by file,
 * then target.
 */
export function findBrokenReferences(files: readonly LinkableFile[]): readonly BrokenReference[] {
  const present = new Set(files.map((file) => file.path));
  const broken: BrokenReference[] = [];
  for (const file of files) {
    if (!file.path.endsWith(".md")) continue;
    if (basenameOf(file.path).endsWith("-template.md")) continue;
    for (const match of file.content.matchAll(MARKDOWN_LINK)) {
      const raw = match[1];
      if (raw === undefined) continue;
      if (isExternalOrAnchor(raw)) continue;
      if (raw.includes("{")) continue; // {placeholder} — template syntax, not a file
      const target = raw.split("#")[0] ?? raw;
      if (target.length === 0) continue;
      const directory = directoryOf(target);
      if (directory !== "" && directory !== "./") continue; // project reference
      if (!basenameOf(target).includes(".")) continue; // placeholder, not a file
      const fileDir = directoryOf(file.path);
      const resolved = `${fileDir}${target.replace(/^\.\//, "")}`;
      if (!present.has(resolved)) broken.push({ file: file.path, target });
    }
  }
  return broken.sort((a, b) =>
    a.file < b.file ? -1 : a.file > b.file ? 1 : a.target < b.target ? -1 : 1,
  );
}
