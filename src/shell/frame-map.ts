import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRecordForm } from "../core/change.ts";
import {
  FRAME_MAP_FILE,
  frameMapOf,
  frameMapText,
  type FrameMap,
  type FrameMapWriter,
} from "../core/frame-map.ts";
import { parseFrameMapFile } from "../core/frame-map-file.ts";
import { recordPath } from "../core/git-hooks.ts";
import { atomicWriteFile } from "./fs/io.ts";
import { committedRecord } from "./hooks.ts";

/** A frame section that holds no frame yet: absent, empty, a skipped step's line or the skeleton's placeholder. */
function unwritten(text: string | undefined): boolean {
  return text === undefined || text === "" || /^none at \S+$/.test(text) || /^<[^>]*>$/.test(text);
}

/**
 * A change's frame section as its record holds it, or why there is none:
 * the record is absent, does not parse or holds no frame yet.
 */
function frameSection(
  root: string,
  change: string,
): { readonly section: string; readonly state: string } | { readonly reason: string } {
  const record = join(root, recordPath(change));
  if (!existsSync(record)) return { reason: "the change has no record on disk" };
  const form = parseRecordForm(`${change}.md`, readFileSync(record, "utf8"));
  if (form._tag === "err")
    return { reason: "the record does not parse, so its frame section is not read" };
  const section = form.value.sections.find((candidate) => candidate.heading === "frame")?.text;
  return section === undefined || unwritten(section)
    ? { reason: "the record's frame section holds no frame yet" }
    : { section, state: form.value.position.state };
}

/** A change's frame map as the inspector reads it: where it was read, or why there is none. */
export type FrameMapReading =
  | { readonly source: "file" | "record"; readonly map: FrameMap; readonly reason: null }
  | { readonly source: null; readonly map: null; readonly reason: string };

/**
 * Read a change's frame map for the inspector (J-117 S4): the file beside
 * the record where it stands, else the record's frame section read live, so
 * the map shows before the event hook has written it.
 * @param root the repository root
 * @param change the change's id
 * @returns the map and where it was read, or why there is none
 */
export function readFrameMap(root: string, change: string): FrameMapReading {
  const path = join(root, ".greenline", "ledger", change, FRAME_MAP_FILE);
  if (existsSync(path)) {
    const read = parseFrameMapFile(readFileSync(path, "utf8"), change);
    return "map" in read
      ? { source: "file", map: read.map, reason: null }
      : { source: null, map: null, reason: read.reason };
  }
  const read = frameSection(root, change);
  return "reason" in read
    ? { source: null, map: null, reason: read.reason }
    : { source: "record", map: frameMapOf(read.section), reason: null };
}

/** The states that close a record, after which its committed map stands. */
const CLOSED_STATES = new Set(["done", "dropped"]);

/**
 * Write a change's frame map, `.greenline/ledger/<id>/frame-map.json`, from
 * its record's frame section (J-117 S1): written when it would change, and
 * left as it stands while the record does not parse or its frame section
 * holds no frame yet. It follows the record to its closing commit (J-226
 * S1; j217c-roster-use finding 8): derived while HEAD's record of the change
 * is not yet done or dropped, whatever state the working record holds, so
 * the write that closes the record derives it once more; once HEAD carries
 * the closed record, the map stays as that commit left it (J-135 S2). The
 * event hook calls it after a tool, whatever wrote the record.
 * @param root the repository root
 * @param change the change's id
 * @param writer the command writing it, its `generatedBy`
 */
export function writeFrameMap(root: string, change: string, writer: FrameMapWriter): void {
  const read = frameSection(root, change);
  if ("reason" in read) return;
  const section = read.section;
  const path = join(root, ".greenline", "ledger", change, FRAME_MAP_FILE);
  const text = frameMapText(change, frameMapOf(section), writer);
  let current: string | undefined;
  try {
    current = readFileSync(path, "utf8");
  } catch {
    current = undefined;
  }
  if (current === text) return;
  // HEAD is read only where the map would change, the commit's record state its one question.
  const committed = committedRecord(root, "HEAD", change)?.state;
  if (committed !== undefined && CLOSED_STATES.has(committed)) return;
  atomicWriteFile(path, text);
}
