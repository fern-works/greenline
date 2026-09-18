import { sha256Hex } from "../commons/hash.ts";

/** One step of a line diff. */
export interface LineEdit {
  readonly kind: "equal" | "removed" | "added";
  readonly line: string;
}

/**
 * One measured difference between an upstream file and its edited copy:
 * a maximal run of changed lines with no equal line inside it, or a
 * whole file present on only one side.
 */
export interface TextHunk {
  /** `"h:"` + the first 16 hex of the content digest; later duplicates within one file carry `#2`, `#3`, ... */
  readonly id: string;
  /** The file path inside the skill directory. */
  readonly path: string;
  readonly kind: "changed" | "added" | "removed";
  /** Lines from `before`, raw and untrimmed. */
  readonly removed: readonly string[];
  /** Lines from `after`, raw and untrimmed. */
  readonly added: readonly string[];
}

/** A hunk before its identity is assigned. */
interface HunkLines {
  readonly kind: TextHunk["kind"];
  readonly removed: readonly string[];
  readonly added: readonly string[];
}

const equal = (line: string): LineEdit => ({ kind: "equal", line });
const removed = (line: string): LineEdit => ({ kind: "removed", line });
const added = (line: string): LineEdit => ({ kind: "added", line });

/** Split text into lines: "\n" separated, a trailing newline adds no empty last line. */
export function splitLines(text: string): readonly string[] {
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * The furthest x reached on diagonal k = x - y. A diagonal no round has
 * reached reads 0, which is also the seed Myers gives diagonal 1.
 */
function reach(frontier: ReadonlyMap<number, number>, k: number): number {
  return frontier.get(k) ?? 0;
}

/**
 * Myers' tie-break: step down (an addition) only when the diagonal
 * below reached further; on equal reach step right (a removal), so a
 * changed run lists its removals before its additions.
 */
function stepsDown(frontier: ReadonlyMap<number, number>, d: number, k: number): boolean {
  return k === -d || (k !== d && reach(frontier, k - 1) < reach(frontier, k + 1));
}

/**
 * Deterministic line diff (Myers O(ND) shortest edit script). Equal
 * inputs yield only `equal` steps; the script replays `before` into
 * `after` when applied in order.
 */
export function diffLines(
  before: readonly string[],
  after: readonly string[],
): readonly LineEdit[] {
  const frontier = new Map<number, number>();
  const trace: ReadonlyMap<number, number>[] = [];
  // Round d reaches every point a script of d edits can reach; the loop
  // returns by round before.length + after.length at the latest, since
  // removing every line then adding every line is always a script.
  for (let d = 0; ; d += 1) {
    trace.push(new Map(frontier));
    for (let k = -d; k <= d; k += 2) {
      let x = stepsDown(frontier, d, k) ? reach(frontier, k + 1) : reach(frontier, k - 1) + 1;
      let y = x - k;
      while (x < before.length && y < after.length && before[x] === after[y]) {
        x += 1;
        y += 1;
      }
      frontier.set(k, x);
      if (x >= before.length && y >= after.length) return backtrack(before, after, trace);
    }
  }
}

/** Walk the trace from the end point back to the origin; each round owns one edit and its snake. */
function backtrack(
  before: readonly string[],
  after: readonly string[],
  trace: readonly ReadonlyMap<number, number>[],
): readonly LineEdit[] {
  const steps: (readonly LineEdit[])[] = [];
  let x = before.length;
  let y = after.length;
  for (const [d, frontier] of [...trace.entries()].reverse()) {
    if (d === 0) break;
    const k = x - y;
    const down = stepsDown(frontier, d, k);
    const previousK = down ? k + 1 : k - 1;
    const previousX = reach(frontier, previousK);
    const previousY = previousX - previousK;
    // One step off the previous point (down adds a line, right removes
    // one), then the diagonal snake of equal lines up to (x, y).
    const midX = down ? previousX : previousX + 1;
    const midY = midX - k;
    steps.push([
      ...before.slice(previousX, midX).map(removed),
      ...after.slice(previousY, midY).map(added),
      ...before.slice(midX, x).map(equal),
    ]);
    x = previousX;
    y = previousY;
  }
  // Round 0 is the leading snake of equal lines from the origin.
  steps.push(before.slice(0, x).map(equal));
  return steps.reverse().flat();
}

/** Consecutive removed/added steps with no equal step between them form one changed run. */
function changedRuns(edits: readonly LineEdit[]): readonly HunkLines[] {
  const runs: HunkLines[] = [];
  let removedLines: string[] = [];
  let addedLines: string[] = [];
  const close = (): void => {
    if (removedLines.length > 0 || addedLines.length > 0)
      runs.push({ kind: "changed", removed: removedLines, added: addedLines });
    removedLines = [];
    addedLines = [];
  };
  for (const edit of edits) {
    if (edit.kind === "equal") close();
    else if (edit.kind === "removed") removedLines.push(edit.line);
    else addedLines.push(edit.line);
  }
  close();
  return runs;
}

/** Content identity over trailing-whitespace-trimmed lines; position in the file plays no part. */
function hunkId(path: string, run: HunkLines): string {
  const trimmed = (lines: readonly string[]): string =>
    lines.map((line) => line.replace(/[ \t]+$/, "")).join("\n");
  const preimage = [path, run.kind, trimmed(run.removed), trimmed(run.added)].join("\0");
  return `h:${sha256Hex(preimage).slice(0, 16)}`;
}

/**
 * Hunks between two versions of one file. `undefined` means the file is
 * absent on that side: absent before + present after is one `added`
 * hunk holding every line; present before + absent after is one
 * `removed` hunk. Both undefined or byte-equal yields no hunks. Hunk
 * identity is content-based and position-independent so an edit
 * elsewhere in the file leaves a hunk's id alone.
 */
export function hunksBetween(
  path: string,
  before: string | undefined,
  after: string | undefined,
): readonly TextHunk[] {
  const runs: readonly HunkLines[] =
    before === undefined
      ? after === undefined
        ? []
        : [{ kind: "added", removed: [], added: splitLines(after) }]
      : after === undefined
        ? [{ kind: "removed", removed: splitLines(before), added: [] }]
        : before === after
          ? []
          : changedRuns(diffLines(splitLines(before), splitLines(after)));
  const seen = new Map<string, number>();
  return runs.map((run) => {
    const base = hunkId(path, run);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return { id: count === 1 ? base : `${base}#${count}`, path, ...run };
  });
}
