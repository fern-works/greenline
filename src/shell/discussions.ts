import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRecordForm } from "../core/change.ts";
import {
  DISCUSSIONS_FOLDER,
  readDiscussionEntry,
  copiedResearchFolder,
  uncopiedResearch,
  unnamedOrigins,
  type DiscussionEntry,
  type UncopiedReport,
  type UnnamedOrigin,
} from "../core/discussion.ts";
import { recordIds } from "./changes.ts";

/**
 * The discussions on disk (J-118 S2): every Markdown file directly under
 * `.greenline/ledger/discussions/` is a discussion record, read and parsed,
 * never judged against the modes, since a discussion has none. Status, the
 * mirror and the inspector read them through this one reader.
 */

/**
 * List and parse every discussion record of a workspace.
 * @param root the repository root
 * @returns one entry per record file, sorted by id; none when the folder is absent or cannot be read
 */
export function listDiscussions(root: string): readonly DiscussionEntry[] {
  const folder = join(root, DISCUSSIONS_FOLDER);
  let names: readonly string[];
  try {
    names = readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
  return names.map((name) => {
    let text: string | undefined;
    try {
      text = readFileSync(join(folder, name), "utf8");
    } catch {
      text = undefined;
    }
    return readDiscussionEntry(name, text);
  });
}

/** The file names directly in a folder; undefined when it cannot be listed. */
function filesIn(folder: string): readonly string[] | undefined {
  try {
    return readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  } catch {
    return undefined;
  }
}

/** Each record whose `from` line names a discussion, with its state, read from the records' form alone. */
function recordsFrom(
  root: string,
): readonly { readonly id: string; readonly from: readonly string[]; readonly state: string }[] {
  const ledger = join(root, ".greenline", "ledger");
  return (recordIds(root) ?? []).flatMap((id) => {
    let text: string;
    try {
      text = readFileSync(join(ledger, `${id}.md`), "utf8");
    } catch {
      return [];
    }
    const form = parseRecordForm(`${id}.md`, text);
    if (form._tag === "err" || form.value.from === undefined) return [];
    return [{ id, from: form.value.from, state: form.value.position.state }];
  });
}

/**
 * The research reports each open or stopped change promoted from a
 * discussion has not copied into its folder (J-118 S3), read from the
 * records' form alone.
 * @param root the repository root
 * @returns each report not copied
 */
export function readUncopiedResearch(root: string): readonly UncopiedReport[] {
  const changes = recordsFrom(root).flatMap(({ id, from, state }) =>
    state === "open" || state === "stopped" ? [{ id, from }] : [],
  );
  return uncopiedResearch(
    changes,
    (discussion) => filesIn(join(root, DISCUSSIONS_FOLDER, discussion)),
    (change, discussion) => filesIn(join(root, copiedResearchFolder(change, discussion))) ?? [],
  );
}

/**
 * The records whose `from` line names a discussion that does not name them
 * (J-226 S1), in every state, read from the records' form and the
 * discussions on disk.
 * @param root the repository root
 * @returns each origin the discussion's changes line does not name
 */
export function readUnnamedOrigins(root: string): readonly UnnamedOrigin[] {
  return unnamedOrigins(recordsFrom(root), listDiscussions(root));
}
