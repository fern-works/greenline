/**
 * The `vitest` row's one rerun (the register's row of 2026-10-30, "A gate red
 * only to load counts as green"; J-157 S1, J-159 S1, J-162 S1). On a red the
 * row reads the files that failed and, when they account for the whole red,
 * runs those files alone once, one after another, whatever the load: the
 * gate's own parallel run is the contention the load average never shows.
 * The row still reads three load readings, the one-minute average before the
 * suite runs and the one-minute and five-minute averages after it, and names
 * them in its line; they decide nothing. The row is green when every one of
 * the files passes alone, and its note names the three readings and each file
 * rerun. A file that fails alone, or a red the failed files do not account
 * for (an unhandled error, an interrupted run, no report, no failed file),
 * stays red; the row never reruns twice.
 *
 * The module is also the reporter that tells the row which files failed: the
 * default export, loaded by Vitest through `--reporter`, writes each test
 * file's state, the count of unhandled errors and the run's end reason to the
 * file `GREENLINE_VITEST_REPORT` names. The public tree keeps it beside
 * `scripts/check.mjs`, so the public gate's `vitest` row runs the same code.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

/** The words a rerun's note begins with; `rerunNoteIn` finds them in a nested gate's output. */
const RERUN_WORDS = "green after a rerun alone of";
/** The reporter's path from the root, which the gate's rows run from. */
const REPORTER = "./scripts/lib/vitest-rerun.mjs";

/**
 * @typedef {{ file: string, state: string }} Module
 * @typedef {{ reason: string, unhandledErrors: number, modules: Module[] }} Report
 * @typedef {{ status: number | null, report: Report | null, finding: string }} Run
 * @typedef {{ ok: true, note: string } | { ok: false, finding: string }} Row
 */

/**
 * The files a red's report names as failed, when they account for the whole
 * red; an empty list otherwise, and the red is not rerun.
 * @param {Report | null} report
 * @returns {string[]}
 */
function failedFiles(report) {
  if (!report || report.reason !== "failed" || report.unhandledErrors !== 0) return [];
  return report.modules.filter((module) => module.state === "failed").map((module) => module.file);
}

/**
 * Whether a rerun passed every file it was asked to run, and nothing else failed.
 * @param {Run} run
 * @param {string[]} files
 * @returns {boolean}
 */
function passedAlone(run, files) {
  const report = run.report;
  if (run.status !== 0 || !report) return false;
  if (report.reason !== "passed" || report.unhandledErrors !== 0) return false;
  if (report.modules.some((module) => module.state === "failed")) return false;
  const passed = new Set(
    report.modules.filter((module) => module.state === "passed").map((module) => module.file),
  );
  return files.every((file) => passed.has(file));
}

/**
 * The row's decision: the suite once, then at most one rerun of its failed
 * files alone. `load` answers as `os.loadavg()` does; the row reads it before
 * the suite (the one-minute average) and after it (the one-minute and the
 * five-minute averages) and names the three with `cores` in its line; they
 * decide nothing.
 * @param {{ runSuite: () => Run, runAlone: (files: string[]) => Run, load: () => readonly number[], cores: number }} seam
 * @returns {Row}
 */
export function vitestRow({ runSuite, runAlone, load, cores }) {
  const start = load()[0] ?? 0;
  const suite = runSuite();
  if (suite.status === 0) return { ok: true, note: "" };
  const files = failedFiles(suite.report);
  if (files.length === 0) return { ok: false, finding: suite.finding };
  const after = load();
  const end = after[0] ?? 0;
  const five = after[1] ?? 0;
  const under = `a load of ${start.toFixed(2)} at the start, ${end.toFixed(2)} at the end and ${five.toFixed(2)} over five minutes on ${cores} cores`;
  const alone = runAlone(files);
  const count = `${files.length} ${files.length === 1 ? "file" : "files"}`;
  if (passedAlone(alone, files))
    return { ok: true, note: `${RERUN_WORDS} ${count} under ${under}: ${files.join(", ")}` };
  return {
    ok: false,
    finding: `${alone.finding || suite.finding} (failed alone in a rerun under ${under}: ${files.join(", ")})`,
  };
}

/**
 * A tool's finding from its output: the first lines of stderr and the last of stdout.
 * @param {unknown} stdout
 * @param {unknown} stderr
 * @returns {string}
 */
function findingLines(stdout, stderr) {
  const lines = (bytes) =>
    String(bytes ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  return [...lines(stderr).slice(0, 3), ...lines(stdout).slice(-4)].join(" / ");
}

/**
 * One Vitest run with this module as a second reporter beside the default one.
 * @param {string[]} args the arguments after `vitest`
 * @param {NodeJS.ProcessEnv} env
 * @returns {Run}
 */
export function runVitest(args, env) {
  const dir = mkdtempSync(join(tmpdir(), "greenline-vitest-"));
  const file = join(dir, "report.json");
  try {
    const run = spawnSync(
      "npx",
      ["--no-install", "vitest", ...args, "--reporter=default", `--reporter=${REPORTER}`],
      {
        encoding: "utf8",
        env: { ...env, GREENLINE_VITEST_REPORT: file },
        maxBuffer: 64 * 1024 * 1024,
        shell: process.platform === "win32",
      },
    );
    const report = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
    const finding =
      findingLines(run.stdout, run.stderr) || String(run.error ?? `exit ${run.status}`);
    return { status: run.status, report, finding };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The rerun note a nested gate printed for its `vitest` row, or "".
 * @param {string} stdout
 * @returns {string}
 */
export function rerunNoteIn(stdout) {
  const line = stdout.split("\n").find((entry) => entry.startsWith(`vitest: ${RERUN_WORDS} `));
  return line ? line.slice("vitest: ".length).trim() : "";
}

/** The reporter Vitest loads through `--reporter`: each file's state, the unhandled errors, the reason. */
export default class FailuresReporter {
  /** @param {{ file?: string }} [options] */
  constructor(options = {}) {
    this.file = options.file ?? process.env["GREENLINE_VITEST_REPORT"];
  }

  /**
   * @param {ReadonlyArray<{ moduleId: string, state: () => string }>} testModules
   * @param {ReadonlyArray<unknown>} unhandledErrors
   * @param {string} reason
   */
  onTestRunEnd(testModules, unhandledErrors, reason) {
    if (!this.file) return;
    const modules = testModules.map((module) => ({
      file: relative(process.cwd(), module.moduleId).split(sep).join("/"),
      state: module.state(),
    }));
    writeFileSync(
      this.file,
      JSON.stringify({ reason, unhandledErrors: unhandledErrors.length, modules }),
    );
  }
}
