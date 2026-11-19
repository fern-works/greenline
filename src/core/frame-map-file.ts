import { z } from "zod";
import { FRAME_MAP_FILE, FRAME_NODES, type FrameMap } from "./frame-map.ts";

/*
 * The frame map's schema and the reading of its file (J-117 S4), apart from
 * `./frame-map.ts` so the inspector's client, which draws the map and
 * bundles no schema library, imports the map's types and reader alone.
 */

const line = z.string();
const nullableLine = z.string().nullable();

/** The frame map's fields, as the file holds them after its own two keys and as the inspector serves them. */
const frameMapFields = {
  nodes: z.array(
    z
      .object({
        node: z.enum(FRAME_NODES),
        state: z.enum(["open", "closed", "untouched"]),
        reason: nullableLine,
        questions: z.array(line),
      })
      .strict(),
  ),
  questions: z.array(
    z
      .object({
        id: line,
        round: z.number().int().positive(),
        node: line,
        question: line,
        proposed: nullableLine,
        answer: nullableLine,
        decided: z.enum(["owner", "agent"]).nullable(),
        research: z.array(line),
      })
      .strict(),
  ),
  research: z.array(z.object({ file: line, questions: z.array(line) }).strict()),
  restatement: z.string(),
  issues: z.array(line),
};

/** A frame map's schema, as the inspector serves it. */
export const frameMapSchema: z.ZodType<FrameMap> = z.object(frameMapFields).strict();

/** The file's schema: its `generatedBy` and `change` keys, then the map. */
const frameMapFile = z
  .object({ generatedBy: z.literal("greenline event"), change: line, ...frameMapFields })
  .strict();

/**
 * Read a frame map file's text.
 * @param text the file's text
 * @param change the change whose folder holds it
 * @returns the map, or why it does not read
 */
export function parseFrameMapFile(
  text: string,
  change: string,
): { readonly map: FrameMap } | { readonly reason: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { reason: `${FRAME_MAP_FILE} is not JSON` };
  }
  const read = frameMapFile.safeParse(raw);
  if (!read.success)
    return {
      reason: `${FRAME_MAP_FILE} does not hold a frame map: ${read.error.issues[0]?.message ?? "no reason given"}`,
    };
  const { generatedBy, change: named, ...map } = read.data;
  if (named !== change)
    return { reason: `${FRAME_MAP_FILE} names the change ${named}, written by ${generatedBy}` };
  return { map };
}
