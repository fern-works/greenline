// The commit-subject row's parser (the internal refactor's step 6, ruling 6):
// the shape docs/SHIPPING.md states under "Commit messages". `type(scope):
// outcome` with one of the types in use, at most 72 characters; a body in
// prose unless the subject is one of the two fixed formulas (the accounting
// commit of a stage, the release commit); the Co-Authored-By trailer on
// every commit; and never `wip` or a bare `fixes`. The row's own decision,
// which range to walk, lives here too so a test can drive it.
const TYPES = ["docs", "feat", "fix", "refactor", "qa", "chore", "export"];
const SUBJECT = new RegExp(`^(${TYPES.join("|")})(\\([a-z0-9-]+\\))?: (.+)$`);
// The release commit's fixed form (docs/SHIPPING.md): the version, a comma
// and what a consumer gets; the house refuses the em dash, so the form uses none.
const RELEASE = /^release: v\d+\.\d+\.\d+, .+$/;
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
 * One message file, read as git stores it, then checked as the history row
 * checks a commit (procedures-on-the-line S2, R14 and R24). With `strip`,
 * git's cleanup for an edited message: lines that begin with `#` are
 * dropped, and so is everything from the scissors line that `git commit -v`
 * writes. Without it, the `whitespace` cleanup `git commit -F` and
 * `git commit-tree -F` apply, which keep those lines (`ceremony land` and
 * `ceremony commit`). The subject is the first paragraph, its lines joined as
 * `%s` joins them; the body is the rest, as `%b` gives it.
 * @param {string} text the message file's contents
 * @param {{ strip?: boolean }} [options] whether git strips comment lines (default true)
 * @returns {{ subject: string, problems: string[] }} the subject and its problems; empty when the message has the shape
 */
export function checkMessage(text, { strip = true } = {}) {
  const lines = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (strip && /^# -+ >8 -+$/.test(line)) break;
    if (!strip || !line.startsWith("#")) lines.push(line);
  }
  const paragraphs = lines
    .join("\n")
    .trim()
    .split(/\n\s*\n/);
  const subject = paragraphs[0]
    .split("\n")
    .map((line) => line.trim())
    .join(" ")
    .trim();
  const body = paragraphs.slice(1).join("\n\n").trim();
  return { subject, problems: checkCommit({ subject, body }) };
}

/**
 * The refusal the callers print before a commit (`ceremony land`, `ceremony
 * commit` and the `.githooks/commit-msg` hook), in the row's own words.
 * @param {string} text the message file's contents
 * @param {{ strip?: boolean }} [options] as `checkMessage` takes them
 * @returns {string | undefined} the refusal, or undefined when the message has the shape
 */
export function messageRefusal(text, options = {}) {
  const { subject, problems } = checkMessage(text, options);
  if (!problems.length) return undefined;
  return `commit subject refused: ${subject || "(empty)"}: ${problems.join("; ")}`;
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
