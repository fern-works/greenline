/** The recipe and chain fixtures written to a corpus directory on disk, for the instrument's tests. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { chainTexts, fixtureEntries, FIXTURE_MODES } from "./chain.ts";
import { fixtureCorpus } from "./recipe.ts";

/**
 * Write files under a root, making their directories.
 * @param root the directory to write under
 * @param files each file's text by its path under the root
 */
export function writeTree(root: string, files: ReadonlyMap<string, string>): void {
  for (const [path, text] of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

/** The chain fixture's first two entries, the pinned source read and the fixture skill's change. */
export const RECORDED: readonly { readonly name: string; readonly text: string }[] = chainTexts(
  fixtureEntries().slice(0, 2),
);

/**
 * Write the recipe fixture's corpus: the manifest, the snapshots, the recipe,
 * the fixture's modes definition and, when asked, the committed skill
 * directory and the two recorded entries.
 * @param corpus the corpus directory
 * @param options whether to write the skill directory and the entries
 */
export function writeFixtureCorpus(
  corpus: string,
  options: { readonly skillDirectory: boolean; readonly recorded: boolean },
): void {
  writeTree(
    corpus,
    new Map(
      [...fixtureCorpus()].filter(
        ([path]) => options.skillDirectory || !path.startsWith("skills/"),
      ),
    ),
  );
  writeTree(corpus, new Map([["runtime/modes.json", FIXTURE_MODES]]));
  if (options.recorded)
    writeTree(
      corpus,
      new Map(RECORDED.map(({ name, text }) => [`ledger/entries/${name}`, text] as const)),
    );
}
