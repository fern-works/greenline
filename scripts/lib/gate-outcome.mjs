/**
 * A gate row's outcome (audit 7, W4 finding 1). A row returns nothing
 * to pass, or `skip(reason)` to report itself unproven with the reason;
 * the runner reads the outcome here and prints the reason in the
 * summary, where the coverage row's docket and a fired clock's name
 * travel. The earlier shape hung the reason on a throwaway function and
 * returned a bare string, so no reason ever printed. One module, so the
 * runner and its regression test cannot drift.
 */

const SKIPPED = Symbol("skipped");

/** The gate's last line when every row passed or skipped; a saved check.log ends with it. */
export const GREEN_LINE = "CHECK: green (skips listed are unproven, not passed)";

/**
 * The value a row returns to report itself unproven, never failed.
 * @param {string} reason
 * @returns {{ [SKIPPED]: string }}
 */
export function skip(reason) {
  return { [SKIPPED]: reason };
}

/**
 * What a row's return value means to the summary.
 * @param {unknown} result
 * @returns {{ status: "PASS" | "SKIP", reason: string }}
 */
export function outcome(result) {
  if (result !== null && result !== undefined && Object.hasOwn(Object(result), SKIPPED)) {
    return { status: "SKIP", reason: String(result[SKIPPED]) };
  }
  return { status: "PASS", reason: "" };
}
