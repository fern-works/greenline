import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain-mjs gate helper, no declaration file (J-157 S1)
import { outcome, passWithNote } from "../../scripts/lib/gate-outcome.mjs";
import FailuresReporter, {
  rerunNoteIn,
  vitestRow,
  // @ts-expect-error plain-mjs gate helper, no declaration file (J-157 S1)
} from "../../scripts/lib/vitest-rerun.mjs";

/**
 * The register's row of 2026-10-30, "A gate red only to load counts as
 * green", applied by the gate (J-157 S1, J-159 S1, J-162 S1): the `vitest`
 * row, on a red its failed files account for, runs those files alone once,
 * whatever the load. The row reads three load readings (the one-minute
 * average at the suite's start, the one-minute average at its end and the
 * five-minute average at its end) and names them in its line; they decide
 * nothing, since the gate's own parallel run is the contention the average
 * never shows. The load and both runs are the seam, so each case plants its
 * red without a nested suite.
 */

type Module = { file: string; state: string };
type Run = {
  status: number | null;
  report: { reason: string; unhandledErrors: number; modules: Module[] } | null;
  finding: string;
};
type Row = { ok: true; note: string } | { ok: false; finding: string };

const red = (failed: string[], passed: string[] = []): Run => ({
  status: 1,
  report: {
    reason: "failed",
    unhandledErrors: 0,
    modules: [
      ...failed.map((file) => ({ file, state: "failed" })),
      ...passed.map((file) => ({ file, state: "passed" })),
    ],
  },
  finding: `FAIL ${failed.join(", ")}`,
});
const green = (files: string[]): Run => ({
  status: 0,
  report: {
    reason: "passed",
    unhandledErrors: 0,
    modules: files.map((file) => ({ file, state: "passed" })),
  },
  finding: "",
});

/** The three readings: the one-minute load at the start, at the end, and the five-minute load at the end. */
type Loads = { start: number; end: number; five: number };
/** One load for all three readings. */
const steady = (load: number): Loads => ({ start: load, end: load, five: load });

/**
 * A seam that answers the suite with `suite` and each rerun from `alone`,
 * counting the reruns. The load answers as `os.loadavg()` does: the start's
 * readings before the suite has run, the end's after it.
 */
const seam = (suite: Run, alone: Run[], loads: Loads, cores = 12) => {
  const reruns: string[][] = [];
  const order: string[] = [];
  let suiteRan = false;
  const result: Row = vitestRow({
    runSuite: () => {
      order.push("suite");
      suiteRan = true;
      return suite;
    },
    runAlone: (files: string[]) => {
      order.push("alone");
      reruns.push(files);
      const next = alone[reruns.length - 1];
      if (next === undefined) throw new Error("a second rerun was asked for");
      return next;
    },
    load: () => {
      order.push("load");
      return suiteRan ? [loads.end, loads.five, 0] : [loads.start, 0, 0];
    },
    cores,
  });
  return { result, reruns, order };
};
const findingOf = (result: Row) => (result.ok ? "" : result.finding);

describe("the vitest row's one rerun", () => {
  it("passes a green suite with no note and no rerun", () => {
    const { result, reruns } = seam(green(["test/a.test.ts"]), [], steady(40));
    expect(result).toEqual({ ok: true, note: "" });
    expect(reruns).toEqual([]);
  });

  it("reruns a red under three low readings and turns it green when the files pass alone, the three readings and the files named", () => {
    const suite = red(["test/a.test.ts", "test/b.test.ts"], ["test/c.test.ts"]);
    const { result, reruns } = seam(suite, [green(["test/a.test.ts", "test/b.test.ts"])], {
      start: 4.1,
      end: 7.8,
      five: 5.25,
    });
    expect(reruns).toEqual([["test/a.test.ts", "test/b.test.ts"]]);
    expect(result).toEqual({
      ok: true,
      note: "green after a rerun alone of 2 files under a load of 4.10 at the start, 7.80 at the end and 5.25 over five minutes on 12 cores: test/a.test.ts, test/b.test.ts",
    });
  });

  it("reads the start's load before the suite runs and the end's after it", () => {
    const { order } = seam(red(["test/a.test.ts"]), [green(["test/a.test.ts"])], steady(3));
    expect(order).toEqual(["load", "suite", "load", "alone"]);
  });

  it("reruns a red whatever the three readings say, naming them as it read them", () => {
    const cases: Array<[Loads, string]> = [
      [steady(0), "0.00 at the start, 0.00 at the end and 0.00 over five minutes"],
      [
        { start: 12, end: 7.5, five: 11.25 },
        "12.00 at the start, 7.50 at the end and 11.25 over five minutes",
      ],
      [
        { start: 30, end: 4, five: 9 },
        "30.00 at the start, 4.00 at the end and 9.00 over five minutes",
      ],
      [
        { start: 12.04, end: 2, five: 3 },
        "12.04 at the start, 2.00 at the end and 3.00 over five minutes",
      ],
    ];
    for (const [loads, readings] of cases) {
      const { result, reruns } = seam(red(["test/a.test.ts"]), [green(["test/a.test.ts"])], loads);
      expect(reruns).toEqual([["test/a.test.ts"]]);
      expect(result).toEqual({
        ok: true,
        note: `green after a rerun alone of 1 file under a load of ${readings} on 12 cores: test/a.test.ts`,
      });
    }
  });

  it("keeps red a file that fails alone under three low readings, naming the readings and the files, and never reruns twice", () => {
    const { result, reruns } = seam(
      red(["test/a.test.ts", "test/b.test.ts"]),
      [red(["test/b.test.ts"], ["test/a.test.ts"]), green(["test/b.test.ts"])],
      { start: 2, end: 3.5, five: 2.75 },
    );
    expect(reruns).toHaveLength(1);
    expect(result).toEqual({
      ok: false,
      finding:
        "FAIL test/b.test.ts (failed alone in a rerun under a load of 2.00 at the start, 3.50 at the end and 2.75 over five minutes on 12 cores: test/a.test.ts, test/b.test.ts)",
    });
  });

  it("never reruns a red the failed files do not account for, under any load", () => {
    const unhandled = red(["test/a.test.ts"]);
    if (unhandled.report) unhandled.report.unhandledErrors = 1;
    const interrupted = red(["test/a.test.ts"]);
    if (interrupted.report) interrupted.report.reason = "interrupted";
    const crashed: Run = { status: 1, report: null, finding: "vitest crashed" };
    const noFile: Run = { ...green(["test/a.test.ts"]), status: 1, finding: "threshold" };
    for (const suite of [unhandled, interrupted, crashed, noFile])
      for (const load of [2, 99]) {
        const { result, reruns } = seam(suite, [green(["test/a.test.ts"])], steady(load));
        expect(reruns).toEqual([]);
        expect(result).toEqual({ ok: false, finding: suite.finding });
      }
  });

  it("keeps red a rerun that exits green without running every failed file", () => {
    const { result } = seam(
      red(["test/a.test.ts", "test/b.test.ts"]),
      [green(["test/a.test.ts"])],
      steady(5),
    );
    expect(result.ok).toBe(false);
    expect(findingOf(result)).toContain(
      "failed alone in a rerun under a load of 5.00 at the start, 5.00 at the end and 5.00 over five minutes on 12 cores",
    );
  });

  it("keeps red a rerun whose report carries an unhandled error", () => {
    const rerun = green(["test/a.test.ts"]);
    if (rerun.report) rerun.report.unhandledErrors = 1;
    const { result } = seam(red(["test/a.test.ts"]), [rerun], steady(5));
    expect(result.ok).toBe(false);
  });
});

describe("the row's note", () => {
  it("reaches the summary as a pass with its reason", () => {
    expect(outcome(passWithNote("green after a rerun alone of 1 file"))).toEqual({
      status: "PASS",
      reason: "green after a rerun alone of 1 file",
    });
  });

  it("is read back from a nested gate's output, as the public gate's row reads its vitest row", () => {
    const stdout = [
      "vitest     PASS  — green after a rerun alone of 1 file under a load of 20.00 at the start, 9.00 at the end and 15.00 over five minutes on 12 cores: test/a.test.ts",
      "vitest: green after a rerun alone of 1 file under a load of 20.00 at the start, 9.00 at the end and 15.00 over five minutes on 12 cores: test/a.test.ts",
      "",
      "CHECK: green (skips listed are unproven, not passed)",
    ].join("\n");
    expect(rerunNoteIn(stdout)).toBe(
      "green after a rerun alone of 1 file under a load of 20.00 at the start, 9.00 at the end and 15.00 over five minutes on 12 cores: test/a.test.ts",
    );
    expect(rerunNoteIn("CHECK: green (skips listed are unproven, not passed)")).toBe("");
  });
});

describe("the failures reporter", () => {
  it("writes each module's state, the unhandled errors and the reason, the files relative to the root", async () => {
    const dir = mkdtempSync(join(tmpdir(), "greenline-vitest-report-"));
    try {
      const file = join(dir, "report.json");
      const reporter = new FailuresReporter({ file });
      await reporter.onTestRunEnd(
        [
          { moduleId: resolve("test/scripts/a.test.ts"), state: () => "failed" },
          { moduleId: resolve("test/scripts/b.test.ts"), state: () => "passed" },
        ],
        [{ message: "boom" }],
        "failed",
      );
      expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
        reason: "failed",
        unhandledErrors: 1,
        modules: [
          { file: "test/scripts/a.test.ts", state: "failed" },
          { file: "test/scripts/b.test.ts", state: "passed" },
        ],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
