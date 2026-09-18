import { splitManagedBlock } from "./managed-block.ts";
import { POLICY_BLOCK_KEY } from "./render.ts";

/**
 * The House rulings stanza (ADR 0024 rank 2; ADR 0028's amendment):
 * the `## House rulings` heading in the user's own region of
 * `AGENTS.md`, outside the managed block. The CLI parses one shape
 * only, the dash lines under that heading, and lists them; every
 * other line in the region is the user's and is never read as a
 * ruling. Nothing here writes: the stanza is the user's pen and the
 * agent's on the user's word.
 */

const HEADING = "## House rulings";

/** A heading line of any level ends the stanza. */
function isHeading(line: string): boolean {
  return line.startsWith("#");
}

/**
 * The rulings, in file order: each dash line under the heading, with
 * its indented continuation lines joined by single spaces. Absent
 * heading, or a heading only inside the managed block: an empty list.
 */
export function parseHouseRulings(agentsMd: string): readonly string[] {
  const split = splitManagedBlock(agentsMd, POLICY_BLOCK_KEY);
  const userRegion = `${split.head}\n${split.tail}`;
  const lines = userRegion.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === HEADING);
  if (start === -1) return [];
  const rulings: string[] = [];
  let open = false;
  for (const line of lines.slice(start + 1)) {
    if (isHeading(line)) break;
    if (line.startsWith("- ")) {
      rulings.push(line.slice(2).trim());
      open = true;
      continue;
    }
    const continuation = open && /^\s+\S/.test(line);
    if (continuation) {
      const last = rulings.length - 1;
      rulings[last] = `${rulings[last] ?? ""} ${line.trim()}`;
      continue;
    }
    open = false;
  }
  return rulings;
}
