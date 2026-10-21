/**
 * The situation `greenline status` prints above the changes
 * (`workshop/components/cli-contracts.md`, "status"): what the agent reads
 * once before a session's first proposal. The repository's commits, how many
 * change records it holds, the knowledge homes it keeps, the languages at
 * its roots and the changes stopped on its other local branches, each a fact
 * read from the tree and `.git` alone and stored nowhere. No time of
 * installation is part of it. The shell gathers it (`src/shell/situation.ts`);
 * this module names its parts and prints it.
 */

/** The commits HEAD reaches and the branch it names, or why git cannot say. */
export type CommitsReading =
  | {
      readonly kind: "known";
      readonly count: number;
      /** The branch HEAD names, a branch with no commit yet included; null at a detached HEAD. */
      readonly branch: string | null;
    }
  | { readonly kind: "unknown"; readonly why: string };

/** The kinds of memory a repository keeps a home for, as the work guide's homes table names them. */
export type HomeKind = "decisions" | "adr" | "glossary" | "contributing";

/** A knowledge home found: its kind and its path from the root, a folder's ending in a slash. */
export interface KnowledgeHome {
  readonly kind: HomeKind;
  readonly path: string;
}

/**
 * Where each knowledge home is looked for, in the order the situation lists
 * them: the decisions book, the ADR home and the glossary and its map as the
 * installed work guide's homes table names them, and a contributing guide in
 * the three places a forge reads one. A name matches only as written.
 */
export const KNOWLEDGE_HOMES: readonly {
  readonly kind: HomeKind;
  readonly path: string;
  readonly folder: boolean;
}[] = [
  { kind: "decisions", path: ".greenline/DECISIONS.md", folder: false },
  { kind: "adr", path: "docs/adr", folder: true },
  { kind: "glossary", path: "GLOSSARY.md", folder: false },
  { kind: "glossary", path: "GLOSSARY-MAP.md", folder: false },
  { kind: "contributing", path: "CONTRIBUTING.md", folder: false },
  { kind: "contributing", path: ".github/CONTRIBUTING.md", folder: false },
  { kind: "contributing", path: "docs/CONTRIBUTING.md", folder: false },
];

/** One language and the roots that hold its files: `.` for the top of the tree, a top-level folder with its slash. */
export interface LanguageRoots {
  readonly language: string;
  readonly roots: readonly string[];
}

/** The languages at the roots, or why the files could not be listed. */
export type LanguagesReading =
  | { readonly kind: "known"; readonly languages: readonly LanguageRoots[] }
  | { readonly kind: "unknown"; readonly why: string };

/** The ids of the changes stopped on other local `greenline/*` branches, or why git cannot say. */
export type StoppedElsewhere =
  | { readonly kind: "known"; readonly changes: readonly string[] }
  | { readonly kind: "unknown"; readonly why: string };

/** How many change records the ledger holds, or why that cannot be said. */
export type RecordsReading =
  | { readonly kind: "known"; readonly count: number }
  | { readonly kind: "unknown"; readonly why: string };

/** The situation as `status` prints it and `--json` carries it. */
export interface Situation {
  readonly commits: CommitsReading;
  /** How many change records the ledger holds; none means the first request is the orientation. */
  readonly records: RecordsReading;
  readonly homes: readonly KnowledgeHome[];
  readonly languages: LanguagesReading;
  readonly stoppedElsewhere: StoppedElsewhere;
}

/** A file's language by its extension; a file of no listed language counts for none. */
const EXTENSIONS: ReadonlyMap<string, string> = new Map([
  ["ts", "typescript"],
  ["tsx", "typescript"],
  ["mts", "typescript"],
  ["cts", "typescript"],
  ["js", "javascript"],
  ["jsx", "javascript"],
  ["mjs", "javascript"],
  ["cjs", "javascript"],
  ["py", "python"],
  ["go", "go"],
  ["rs", "rust"],
  ["java", "java"],
  ["kt", "kotlin"],
  ["kts", "kotlin"],
  ["cs", "c#"],
  ["cpp", "c++"],
  ["cc", "c++"],
  ["cxx", "c++"],
  ["hpp", "c++"],
  ["c", "c"],
  ["h", "c"],
  ["rb", "ruby"],
  ["php", "php"],
  ["swift", "swift"],
  ["ex", "elixir"],
  ["exs", "elixir"],
  ["scala", "scala"],
  ["dart", "dart"],
]);

/**
 * The languages at the roots: each file's language by its extension, under
 * the root it stands in, `.` for a file at the top of the tree and the
 * top-level folder otherwise; the workspace's own `.greenline/` and the files
 * greenline installed are left out.
 * @param files the repository's files, from its root, forward slashes
 * @param installed the paths greenline installed, from the lock
 * @returns each language found with its roots, both sorted
 */
export function languagesAt(
  files: readonly string[],
  installed: ReadonlySet<string>,
): readonly LanguageRoots[] {
  const found = new Map<string, Set<string>>();
  for (const file of files) {
    if (file.startsWith(".greenline/") || installed.has(file)) continue;
    const name = file.slice(file.lastIndexOf("/") + 1);
    const dot = name.lastIndexOf(".");
    const language = dot <= 0 ? undefined : EXTENSIONS.get(name.slice(dot + 1).toLowerCase());
    if (language === undefined) continue;
    const slash = file.indexOf("/");
    const root = slash === -1 ? "." : `${file.slice(0, slash)}/`;
    found.set(language, (found.get(language) ?? new Set()).add(root));
  }
  return [...found.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([language, roots]) => ({ language, roots: [...roots].sort() }));
}

function commitsText(commits: CommitsReading): string {
  if (commits.kind === "unknown") return `unknown (${commits.why})`;
  const where = commits.branch === null ? "at a detached HEAD" : `on ${commits.branch}`;
  return commits.count === 0 ? `none, ${where}` : `${commits.count} ${where}`;
}

function recordsText(records: RecordsReading): string {
  if (records.kind === "unknown") return `unknown (${records.why})`;
  return records.count === 0 ? "none" : String(records.count);
}

function languagesText(languages: LanguagesReading): string {
  if (languages.kind === "unknown") return `unknown (${languages.why})`;
  if (languages.languages.length === 0) return "none found";
  return languages.languages
    .map((entry) => `${entry.language} (${entry.roots.join(", ")})`)
    .join(", ");
}

/**
 * The situation as text: deterministic, facts only.
 * @param situation the situation
 * @returns the text, ending with a newline
 */
export function renderSituationText(situation: Situation): string {
  const stopped = situation.stoppedElsewhere;
  return [
    "situation",
    `  commits: ${commitsText(situation.commits)}`,
    `  change records: ${recordsText(situation.records)}`,
    `  knowledge homes: ${situation.homes.length === 0 ? "none" : situation.homes.map((home) => home.path).join(", ")}`,
    `  languages: ${languagesText(situation.languages)}`,
    `  stopped on other branches: ${
      stopped.kind === "unknown"
        ? `unknown (${stopped.why})`
        : stopped.changes.length === 0
          ? "none"
          : stopped.changes.join(", ")
    }`,
    "",
  ].join("\n");
}
