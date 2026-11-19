import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { parseJson } from "../core/contract.ts";
import type { SpentLift } from "../core/guardrails.ts";
import { readGit } from "./code-tree.ts";

/**
 * The lifts the record's lines spent (J-173 S1; `src/core/guardrails.ts`):
 * one JSON line per act the guardrails let through on a line, its change,
 * the line, the owner's words as the committed record held them, what they
 * lifted, the command and when, kept in the repository's git directory,
 * `greenline/lifts.jsonl` beside git's own files, which no discard, clean
 * or checkout of the work tree reaches and every worktree of the repository
 * shares. A resume reads it, so words already spent lift no act of another
 * kind. Local to the clone; a line that does not read is passed over.
 */

/** The file's name under the git directory. */
const LIFTS = join("greenline", "lifts.jsonl");

const liftSchema = z.object({
  change: z.string(),
  line: z.enum(["discard", "rebase", "landing"]),
  words: z.string(),
  act: z.enum(["discard", "landing", "force-push", "branch-delete"]),
  command: z.string(),
  at: z.string(),
});

/** The file's path in the repository's common git directory, or undefined where git does not answer. */
function liftsPath(root: string): string | undefined {
  const common = readGit(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const dir = common._tag === "ok" ? common.value.trim() : "";
  return dir === "" ? undefined : join(dir, LIFTS);
}

/**
 * The lifts a change's lines spent.
 * @param root the repository root
 * @param change the change's id
 * @returns its lifts, oldest first; none where the file stands nowhere
 */
export function spentLifts(root: string, change: string): readonly SpentLift[] {
  const path = liftsPath(root);
  if (path === undefined) return [];
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  return text.split("\n").flatMap((line) => {
    const read = liftSchema.safeParse(parseJson(line));
    if (!read.success || read.data.change !== change) return [];
    const { line: spent, words, act, command, at } = read.data;
    return [{ line: spent, words, act, command, at }];
  });
}

/**
 * Note the lifts an act spent, after the hook let it through.
 * @param root the repository root
 * @param change the change's id
 * @param lifts the lifts, each with its line's words
 */
export function noteLifts(root: string, change: string, lifts: readonly SpentLift[]): void {
  const path = liftsPath(root);
  if (path === undefined || lifts.length === 0) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, lifts.map((lift) => `${JSON.stringify({ change, ...lift })}\n`).join(""));
}
