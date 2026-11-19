/**
 * The rabbithole nudge (J-195 S3): the operator's phrase of 2026-11-07,
 * lifted as written from the phrasebook (`corpus/manifest.json`), which
 * the after-tool hook prints once per change when the change's facts show
 * the same files edited three times since its last passing recorded check.
 * The phrase is a self-check the facts can trigger, so its home is a hook
 * line, a fact the mirror prints, never a sentence an agent must remember.
 */

/** The operator's phrase, verbatim. */
export const RABBITHOLE_PHRASE =
  "are you in a rabbithole duct taping custom fixes together? is there a native way of doing this that would be cleaner?";

/** The nudge's rule, the name its line ends on and the raw log's fact carries. */
export const RABBITHOLE_RULE = "rabbithole";

/** The edits to one file since the last passing recorded check that call the nudge. */
const RABBITHOLE_EDITS = 3;

/** One write tool's edit as the change's raw log holds it: its time and the files it wrote, from the root. */
export interface LoggedEdit {
  readonly at: string;
  readonly paths: readonly string[];
}

/**
 * The files edited {@link RABBITHOLE_EDITS} times or more since the last
 * passing recorded check, in the order each reached the count; none where
 * no file has.
 * @param edits the change's edits, in the raw log's order
 * @param lastPass when the change's last passing recorded check ended, undefined where none has
 * @returns the files
 */
export function rabbitholeFiles(
  edits: readonly LoggedEdit[],
  lastPass: string | undefined,
): readonly string[] {
  const since = lastPass === undefined ? Number.NEGATIVE_INFINITY : Date.parse(lastPass);
  const counts = new Map<string, number>();
  const reached: string[] = [];
  for (const edit of edits) {
    if (!(Date.parse(edit.at) > since)) continue;
    for (const path of new Set(edit.paths)) {
      const count = (counts.get(path) ?? 0) + 1;
      counts.set(path, count);
      if (count === RABBITHOLE_EDITS) reached.push(path);
    }
  }
  return reached;
}

/**
 * The after-tool line: the phrase, the files that called it and the rule.
 * @param files the files edited three times since the last passing recorded check
 * @returns the line
 */
export function rabbitholeLine(files: readonly string[]): string {
  return `nudge: ${RABBITHOLE_PHRASE} (${files.join(", ")} each edited three times since the last passing recorded check); ${RABBITHOLE_RULE}, greenline's harness hook`;
}
