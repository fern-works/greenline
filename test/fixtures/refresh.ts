/** The refresh fixture: the recipe fixture's source at a second commit, and a local repository to fetch it from, never the network. */
import { spawnSync } from "node:child_process";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { TINY_SKILL, UPSTREAM_LICENCE, UPSTREAM_NOTES } from "./recipe.ts";

/**
 * The fixture source's `fixture/SKILL.md` at the second commit: the
 * sentence "Read the request ..." changed ("the code" became "any code"),
 * one sentence inserted after it, "Run it and watch it fail ..." removed,
 * and the closing paragraph moved above the list.
 */
export const NEXT_SKILL = `---
name: fixture
description: An upstream skill the recipe tests take from.
---

# Fixture method

Read the request before you touch any code, and say back what you heard in one sentence. Ask which behavior matters most before you start. Then write the smallest test that fails for the reason you expect, e.g. a missing branch.

This sentence is one the recipe drops. When the test passes, refactor the code and the test together, and run the whole suite again before you report anything to the person who asked.

- Keep each test small enough that its name states the one behavior it proves.
- Prefer a real seam, such as a file system in a temporary directory, over a mock of your own module.
- Delete a test that cannot fail for a reason you can name.
`;

/** The changed sentence, at the first commit and at the second. */
export const CHANGED = {
  was: "Read the request before you touch the code, and say back what you heard in one sentence.",
  now: "Read the request before you touch any code, and say back what you heard in one sentence.",
} as const;

/** The sentence the second commit inserts. */
export const INSERTED = "Ask which behavior matters most before you start.";

/** The sentence the second commit removes, which the recipe takes. */
export const REMOVED = "Run it and watch it fail before you write any code at all.";

/** The fixture source's script at the second commit, which the recipe copies whole. */
export const NEXT_SCRIPT = "#!/bin/sh\necho fixture, refreshed\n";

/** The fixture skill's `SKILL.md` once every marker is read and the reverting edit kept: the old text, less the removed sentence. */
export const READ_SKILL = `---
name: "fixture-skill"
description: "A recipe fixture: one taken source, one \\"edit\\", one drop."
---

# Fixture method

Read the request before you touch the code, and restate what you heard in one sentence. Then write the smallest test that fails for the reason you expect, e.g. a missing branch. Greenline adds this sentence to the paragraph.

- Keep each test small enough that its name states the one behavior it proves.
- Prefer a real seam, such as a file system in a temporary directory, over a mock of your own module.
- Delete a test that cannot fail for a reason you can name.

When the test passes, refactor the code and the test together, and run the whole suite again before you report anything to the person who asked.
`;

/** The upstream repository's files at a commit, by path: the skill directories under `skills/` and the licence at the root. */
export function upstreamFiles(skill: string, script: string): ReadonlyMap<string, string> {
  return new Map([
    ["LICENSE", UPSTREAM_LICENCE],
    ["skills/fixture/SKILL.md", skill],
    ["skills/fixture/notes.md", UPSTREAM_NOTES],
    ["skills/fixture/run.sh", script],
    ["skills/tiny/SKILL.md", TINY_SKILL],
  ]);
}

/** The second commit's files. */
export const NEXT_FILES: ReadonlyMap<string, string> = upstreamFiles(NEXT_SKILL, NEXT_SCRIPT);

/** The snapshot entries the fixture source's inventory records, each with its path upstream. */
export const ENTRIES = [
  { name: "fixture", path: "skills/fixture" },
  { name: "tiny", path: "skills/tiny" },
] as const;

/** The variables that locate a repository, which a git hook sets and the fetch must never follow. */
const GIT_LOCATION = new Set([
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_NAMESPACE",
  "GIT_PREFIX",
]);

/** The test's environment with the variables that locate a repository removed, as the entry script hands it to `refresh`. */
export const GIT_ENVIRONMENT: Readonly<Record<string, string | undefined>> = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !GIT_LOCATION.has(name)),
);

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync(
    "git",
    ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", ...args],
    { cwd, encoding: "utf8", env: GIT_ENVIRONMENT },
  );
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

/** A tree entry that is not a file's text: a symbolic link to a target, or a submodule at a commit. */
export type TreeEntry = { readonly link: string } | { readonly submodule: string };

/** A local bare repository and the commits it was built from. */
export interface UpstreamRepository {
  /** Its `file://` URL, as a manifest's `repo` states it. */
  readonly url: string;
  /** The default branch's commits, oldest first. */
  readonly commits: readonly string[];
  /** A commit on a branch the default branch does not hold. */
  readonly side: string;
}

/**
 * Build a bare repository under `root` whose default branch holds one
 * commit per file tree, oldest first, and a side branch off the first.
 * @param root a temporary directory
 * @param trees each commit's files by path
 * @param entries each commit's symbolic links and submodules by path, beside its files
 * @returns the repository's URL and its commits
 */
export function upstreamRepository(
  root: string,
  trees: readonly ReadonlyMap<string, string>[],
  entries: readonly ReadonlyMap<string, TreeEntry>[] = [],
): UpstreamRepository {
  const work = join(root, "work");
  mkdirSync(work, { recursive: true });
  git(work, "init", "--quiet", "--initial-branch=main");
  const commits: string[] = [];
  for (const [index, tree] of trees.entries()) {
    git(work, "rm", "-r", "--quiet", "--ignore-unmatch", ".");
    for (const [path, text] of tree) {
      mkdirSync(dirname(join(work, path)), { recursive: true });
      writeFileSync(join(work, path), text);
    }
    const submodules: (readonly [string, string])[] = [];
    for (const [path, entry] of entries[index] ?? new Map<string, TreeEntry>()) {
      mkdirSync(dirname(join(work, path)), { recursive: true });
      if ("link" in entry) symlinkSync(entry.link, join(work, path));
      else submodules.push([path, entry.submodule]);
    }
    git(work, "add", "--all");
    for (const [path, commit] of submodules)
      git(work, "update-index", "--add", "--cacheinfo", `160000,${commit},${path}`);
    git(work, "commit", "--quiet", "--allow-empty", "-m", `commit ${index}`);
    commits.push(git(work, "rev-parse", "HEAD"));
  }
  git(work, "checkout", "--quiet", "-b", "side", commits[0] ?? "HEAD");
  writeFileSync(join(work, "side.md"), "# Side\n");
  git(work, "add", "--all");
  git(work, "commit", "--quiet", "-m", "side");
  const side = git(work, "rev-parse", "HEAD");
  git(work, "checkout", "--quiet", "main");
  const bare = join(root, "upstream.git");
  git(root, "clone", "--quiet", "--bare", work, bare);
  return { url: `file://${bare}`, commits, side };
}
