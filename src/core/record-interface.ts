/**
 * The change record's `## Interface` section (J-148 S3, S4): the owner's
 * rulings an interface change carries, one dash line each.
 *
 * - `- page <address>: <template path>`: the address the app serves a
 *   server's template at, which the check reads in place of the file's path.
 * - `- floor <rule> [at <where>]: fixed` or
 *   `- floor <rule> [at <where>]: waived, "<the owner's words>"`: a floor
 *   finding the check or the agent named, with the owner's answer; a line
 *   with no answer is a floor finding still waiting for its ruling, and
 *   done waits with it.
 * - `- unlock <section>: "<the owner's words>"`: the owner's words for an
 *   edit to a section of DESIGN.md the rulings hold locked.
 * - `- limit <address>: <the agent's words>`: a capture the check could not
 *   make, named for the owner, which done reads beside the limit's fact
 *   (J-191 S1).
 * - `- app <origin>`: the origin the app serves, which `--path` alone reads
 *   on the web in place of `--url` (J-191 S1).
 *
 * Pure: the shell reads the record's text.
 */

/** The owner's answer to a floor finding, or none yet. */
export type FloorRuling =
  | { readonly kind: "fixed" }
  | { readonly kind: "waived"; readonly words: string }
  | { readonly kind: "none" };

/** One floor finding the record names. */
export interface NamedFloor {
  /** The rule's id, such as `target-size`. */
  readonly rule: string;
  /** Where it was found, as the line names it; empty where it names none. */
  readonly where: string;
  readonly ruling: FloorRuling;
  /** The line as the record holds it, for a breach to quote. */
  readonly line: string;
}

/** One unlock of a locked section, with the owner's words. */
export interface Unlock {
  readonly section: string;
  readonly words: string;
}

/** The lines of the record's `## Interface` section, its heading matched in any case; none where it holds none. */
function interfaceLines(body: string): readonly string[] {
  const out: string[] = [];
  let inside = false;
  for (const line of body.split("\n")) {
    if (line.startsWith("## ")) {
      inside = /^## interface\s*$/i.test(line.trimEnd());
      continue;
    }
    if (inside) out.push(line);
  }
  return out;
}

/** A page line: `- page <address>: <template path>`. */
const PAGE_LINE = /^\s*[-*]\s+page\s+(\/\S*)\s*:\s*(\S+)\s*$/;

/**
 * The served addresses the record declares for its templates (J-148 S4).
 * @param body the record's body
 * @returns each template's path with its address
 */
export function declaredPages(body: string): ReadonlyMap<string, string> {
  const served = new Map<string, string>();
  for (const line of interfaceLines(body)) {
    const match = PAGE_LINE.exec(line);
    if (match !== null) served.set(match[2] ?? "", match[1] ?? "/");
  }
  return served;
}

/** A floor line: `- floor <rule> [at <where>][: <answer>]`. */
const FLOOR_LINE =
  /^\s*[-*]\s+floor\s+([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s+at\s+(.*?))?(?:\s*:\s*((?:fixed|waived)\b.*?))?\s*$/i;

/** A waiver's answer: `waived, "<the owner's words>"`, the words not empty. */
const WAIVED = /^waived\s*,?\s*["“](.+)["”]\s*\.?$/i;

/** The ruling an answer holds. */
function rulingOf(answer: string | undefined): FloorRuling {
  const text = (answer ?? "").trim();
  if (/^fixed\b/i.test(text)) return { kind: "fixed" };
  const waived = WAIVED.exec(text);
  return waived === null ? { kind: "none" } : { kind: "waived", words: waived[1] ?? "" };
}

/**
 * The floor findings the record names, each with the owner's ruling or none (J-148 S3).
 * @param body the record's body
 * @returns the findings, in order
 */
export function namedFloors(body: string): readonly NamedFloor[] {
  return interfaceLines(body).flatMap((line) => {
    const match = FLOOR_LINE.exec(line);
    if (match === null) return [];
    return [
      {
        rule: match[1] ?? "",
        where: (match[2] ?? "").trim(),
        ruling: rulingOf(match[3]),
        line: line.trim(),
      },
    ];
  });
}

/** An unlock line: `- unlock <section>: "<the owner's words>"`. */
const UNLOCK_LINE = /^\s*[-*]\s+unlock\s+([^:]+?)\s*:\s*["“](.+)["”]\s*\.?\s*$/;

/**
 * The sections the owner's words unlock for this change (J-148 S3).
 * @param body the record's body
 * @returns each unlocked section with the words
 */
export function unlocks(body: string): readonly Unlock[] {
  return interfaceLines(body).flatMap((line) => {
    const match = UNLOCK_LINE.exec(line);
    return match === null ? [] : [{ section: (match[1] ?? "").trim(), words: match[2] ?? "" }];
  });
}

/** One capture's limit the record names, in the agent's words (J-191 S1). */
export interface RecordedLimit {
  readonly address: string;
  readonly words: string;
}

/** A limit line: `- limit <address>: <the agent's words>`, the words not empty. */
const LIMIT_LINE = /^\s*[-*]\s+limit\s+(\/\S*)\s*:\s*(\S.*?)\s*$/;

/**
 * The captures' limits the record names (J-191 S1).
 * @param body the record's body
 * @returns each address with the agent's words, in order
 */
export function recordedLimits(body: string): readonly RecordedLimit[] {
  return interfaceLines(body).flatMap((line) => {
    const match = LIMIT_LINE.exec(line);
    return match === null ? [] : [{ address: match[1] ?? "/", words: match[2] ?? "" }];
  });
}

/** An app line: `- app <origin>`, an http or https origin. */
const APP_LINE = /^\s*[-*]\s+app\s+(https?:\/\/[^/\s]+)\/?\s*$/;

/**
 * The origin the app serves, as the record names it (J-191 S1).
 * @param body the record's body
 * @returns the origin, or undefined where no app line stands
 */
export function declaredApp(body: string): string | undefined {
  for (const line of interfaceLines(body)) {
    const match = APP_LINE.exec(line);
    if (match !== null) return match[1];
  }
  return undefined;
}
