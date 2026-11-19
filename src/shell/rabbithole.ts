import { appendFileSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { parseJson } from "../core/contract.ts";
import {
  RABBITHOLE_RULE,
  rabbitholeFiles,
  rabbitholeLine,
  type LoggedEdit,
} from "../core/rabbithole.ts";
import { noteCards } from "./cards-note.ts";
import { recordedFacts } from "./hooks.ts";

/*
 * The rabbithole nudge read in a workspace (J-195 S3; `../core/rabbithole.ts`):
 * the edits the change's raw log holds, `.greenline/tmp/<id>/events.jsonl`,
 * and the change's passing recorded checks under its ledger folder. The
 * nudge's fact is a line of the raw log, which keeps it to once per change,
 * and the line is noted for the next turn's mirror.
 */

/** A raw log line's kind and time, and a write tool's paths and directory where it holds them. */
const LOGGED = z.object({
  kind: z.string(),
  at: z.string(),
  cwd: z.string().nullable().optional(),
  rule: z.string().optional(),
  write: z
    .object({ paths: z.array(z.string()) })
    .nullable()
    .optional(),
});

/** A path from the root, undefined where it lies outside it. */
function fromRoot(root: string, path: string, base: string): string | undefined {
  const relation = relative(root, isAbsolute(path) ? path : resolve(base, path));
  if (relation === "" || relation.startsWith("..") || isAbsolute(relation)) return undefined;
  return relation.split(sep).join("/");
}

/** When the change's last passing recorded check ended, a probe aside; undefined where none has passed. */
function lastPass(root: string, id: string): string | undefined {
  const ends = recordedFacts(root, id).flatMap(({ facts }) =>
    facts.state === "finished" &&
    facts.probe !== true &&
    facts.outcome.kind === "exited" &&
    facts.outcome.code === 0
      ? [Date.parse(facts.startedAt) + facts.durationMs]
      : [],
  );
  return ends.length === 0 ? undefined : new Date(Math.max(...ends)).toISOString();
}

/**
 * The nudge owed after a tool, once per change (J-195 S3): where the raw log
 * holds no nudge yet and the same files were edited three times since the
 * last passing recorded check, the line, its fact appended to the raw log
 * and noted for the session's next turn; undefined otherwise. Never throws.
 * @param root the repository root
 * @param id the open change
 * @param session the harness's session id, null outside a session
 * @returns the line, or undefined where none is owed
 */
export function rabbitholeNudge(
  root: string,
  id: string,
  session: string | null,
): string | undefined {
  try {
    const path = join(root, ".greenline", "tmp", id, "events.jsonl");
    const lines = readFileSync(path, "utf8")
      .split("\n")
      .flatMap((line) => {
        const read = LOGGED.safeParse(parseJson(line));
        return read.success ? [read.data] : [];
      });
    if (lines.some((line) => line.kind === "nudge" && line.rule === RABBITHOLE_RULE))
      return undefined;
    const edits: LoggedEdit[] = lines.flatMap((line) =>
      line.kind !== "after-tool" || line.write === null || line.write === undefined
        ? []
        : [
            {
              at: line.at,
              paths: line.write.paths.flatMap((each) => {
                const from = fromRoot(root, each, line.cwd ?? root);
                // An edit of greenline's own folder is no fix of the code.
                return from === undefined || from.startsWith(".greenline/") ? [] : [from];
              }),
            },
          ],
    );
    const files = rabbitholeFiles(edits, lastPass(root, id));
    if (files.length === 0) return undefined;
    const at = edits.at(-1)?.at ?? new Date().toISOString();
    appendFileSync(
      path,
      `${JSON.stringify({ v: 1, at, kind: "nudge", rule: RABBITHOLE_RULE, files })}\n`,
    );
    const line = rabbitholeLine(files);
    if (session !== null) noteCards(root, session, line);
    return line;
  } catch {
    return undefined;
  }
}
