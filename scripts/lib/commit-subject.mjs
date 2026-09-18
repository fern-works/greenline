// The commit-subject row's parser (the internal refactor's step 6, ruling 6):
// the shape docs/SHIPPING.md states under "Commit messages". `type(scope):
// outcome` with one of the types in use, at most 72 characters; a body in
// prose unless the subject is one of the two fixed formulas (the accounting
// commit of a stage, the release commit); the Co-Authored-By trailer on
// every commit; and never `wip` or a bare `fixes`. The row's own decision,
// which range to walk, lives here too so a test can drive it.
const TYPES = ["docs", "feat", "fix", "refactor", "qa", "chore", "export"];
const SUBJECT = new RegExp(`^(${TYPES.join("|")})(\\([a-z0-9-]+\\))?: (.+)$`);
const RELEASE = /^release: v\d+\.\d+\.\d+ — .+$/;
// The accounting form the workshop used before 2026-09-13; the history walk
// still meets it, and no current close writes it (docs/SHIPPING.md).
const ACCOUNTING = /^docs\(ledger\): record .+; the plan notes .+$/;
const TRAILER = /^co-authored-by: .+ <[^>]+>$/im;
const TRAILER_LINE = /^[A-Za-z-]+: .+$/;
const CAP = 72;

/**
 * The body without its trailer block: git's own grammar, the last paragraph
 * when every line of it is `Token: value`.
 * @param {string} body
 * @returns {string} the prose paragraphs, trimmed
 */
function split(body) {
  const paragraphs = body.trim().split(/\n\s*\n/);
  const last = paragraphs.at(-1) ?? "";
  const trailerBlock =
    last !== "" && last.split("\n").every((line) => TRAILER_LINE.test(line.trim()));
  return {
    prose: (trailerBlock ? paragraphs.slice(0, -1) : paragraphs).join("\n\n").trim(),
    trailers: trailerBlock ? last : "",
  };
}

/**
 * The problems with one commit message.
 * @param {{ subject: string, body: string }} commit the subject line and the body (trailers included)
 * @returns {string[]} problems, one line each; empty when the message has the shape
 */
export function checkCommit({ subject, body }) {
  const problems = [];
  if (subject.length > CAP) problems.push(`subject is ${subject.length} characters (cap ${CAP})`);
  const conventional = SUBJECT.exec(subject);
  if (!conventional && !RELEASE.test(subject))
    problems.push(`subject is not type(scope): outcome with one of ${TYPES.join(", ")}`);
  const outcome = conventional
    ? conventional[3].trim().toLowerCase()
    : subject.trim().toLowerCase();
  if (outcome === "wip" || outcome === "fixes" || /^(wip|fixes)\b/.test(subject.toLowerCase()))
    problems.push("the outcome is wip or a bare fixes");
  const { prose, trailers } = split(body);
  if (prose === "" && !ACCOUNTING.test(subject) && !RELEASE.test(subject)) problems.push("no body");
  if (!TRAILER.test(trailers))
    problems.push(
      TRAILER.test(body)
        ? "the Co-Authored-By trailer is not the body's last paragraph"
        : "no Co-Authored-By trailer",
    );
  return problems;
}

/**
 * The commits in `git log --format=%H%x00%s%x00%b%x1e` output.
 * @param {string} text the log output
 * @returns {{ hash: string, subject: string, body: string }[]}
 */
export function parseCommits(text) {
  return text
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .map((entry) => {
      const [hash, subject, body = ""] = entry.split("\0");
      return { hash: (hash ?? "").trim(), subject: (subject ?? "").trim(), body: body.trim() };
    });
}

/**
 * What the row walks. HEAD is asserted on every run. Under `--full` the walk
 * runs from the cut commit (the one that landed this parser) forward, the
 * cut included; a shallow clone has no history to walk, so the walk is
 * skipped with its reason and HEAD is still asserted.
 * @param {{ full: boolean, shallow: boolean, cut: string | undefined }} facts
 * @returns {{ ranges: string[][], skipped: string | undefined }} the git log range arguments to run, and the walk's skip reason if any
 */
export function walkPlan({ full, shallow, cut }) {
  const head = ["-1"];
  if (!full) return { ranges: [head], skipped: undefined };
  if (shallow)
    return {
      ranges: [head],
      skipped: "shallow clone: HEAD checked, the walk from the cut needs history",
    };
  if (!cut) return { ranges: [head], skipped: "no cut commit in this history; HEAD checked" };
  return { ranges: [[`${cut}^..HEAD`]], skipped: undefined };
}
