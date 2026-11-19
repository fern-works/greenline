import { describe, expect, it } from "vitest";
import {
  ancestryOf,
  backgroundStarts,
  descendantsOf,
  killActs,
  killRefusal,
  parseProcessTable,
  runningLine,
  sessionPids,
  startedRows,
  startsInspector,
  stillRunning,
  tidyChangeOf,
  type ProcessRow,
} from "../../src/core/processes.ts";

/**
 * The kill guard and the processes a session starts (J-148 S1): a kill by
 * name or pattern is refused with the pid form named, a kill of a pid the
 * session started goes on, and a background command's process is found in
 * the table by its program, its literal arguments and its start, never one
 * that ran before it.
 */

/** The Linear replay's command (j109c-linearb, thread 002, turn 005), as the harness reported it. */
const REPLAY =
  'ID=2026-10-28-filter-search; D=.greenline/tmp/$ID; ROOT="$PWD"; pkill -f \'src/main.ts\'; sleep 0.5; rm -f $D/copy/tracker.db; cp tracker.db $D/copy/tracker.db\n(cd $D/copy && TRACKER_PORT=3200 nohup node --disable-warning=ExperimentalWarning "$ROOT/src/main.ts" > ../server.log 2>&1 &); sleep 2';

describe("J-148 S1 the kill guard reads the command's words", () => {
  it("finds a kill by name or pattern in every form, the replay's pkill among them", () => {
    for (const line of [
      "pkill -f 'src/main.ts'",
      "killall node",
      "kill $(lsof -ti:3000)",
      "lsof -ti:3000 | xargs kill -9",
      "kill -9 %1",
      "kill -- -1234",
      "kill -9 -1",
      "fuser -k 3000/tcp",
      "sudo pkill node",
      "sh -c 'pkill -f vite'",
      "eval 'killall npm'",
      "timeout 5 pkill node",
      "cd app && pkill -f server",
    ])
      expect([line, killActs(line).map((act) => act.kind)]).toEqual([line, ["by-name"]]);
    expect(killActs(REPLAY).map((act) => act.kind)).toEqual(["by-name"]);
  });

  it("reads a kill of literal pids by its pids, and a listing or a probe as no kill", () => {
    expect(killActs("kill 4242")).toEqual([{ kind: "by-pid", command: "kill 4242", pids: [4242] }]);
    expect(killActs("kill -9 4242 4250")[0]?.pids).toEqual([4242, 4250]);
    expect(killActs("kill -s TERM 4242")[0]?.kind).toBe("by-pid");
    expect(killActs("kill -SIGKILL 4242")[0]?.kind).toBe("by-pid");
    for (const line of [
      "kill -l",
      "kill -0 4242",
      "kill -s 0 4242",
      "killall -l",
      "echo 'pkill -f main'",
      "git commit -m 'pkill the server'",
      "pgrep -f main",
      "fuser 3000/tcp",
    ])
      expect([line, killActs(line)]).toEqual([line, []]);
  });

  it("refuses a kill by name with the pid form named, its rule last", () => {
    const [act] = killActs("pkill -f 'src/main.ts'");
    expect(act).toBeDefined();
    if (act === undefined) return;
    const refusal = killRefusal(act, new Set([4242]), ["free the port"]);
    expect(refusal).toBe(
      "`pkill -f src/main.ts` would stop every process its name, pattern or port matches, the owner's own among them; stop a process by its pid, one the session started; kill-by-name",
    );
  });

  it("admits a pid the session started, or one the owner's words name, and refuses any other", () => {
    const [act] = killActs("kill 4242 4250");
    if (act === undefined) throw new Error("no act");
    expect(killRefusal(act, new Set([4242, 4250]), [])).toBeUndefined();
    expect(killRefusal(act, new Set([4242]), ["stop 4250 too, it is mine"])).toBeUndefined();
    expect(killRefusal(act, new Set([4242]), ["stop the server"])).toBe(
      "`kill 4242 4250` would stop process 4250, which this session did not start; stop a process by its pid, one the session started, or ask the owner and run it once their words name the pid; kill-by-name",
    );
    // A number that only contains the pid names another.
    expect(killRefusal(act, new Set([4242]), ["port 42500"])).toBeDefined();
  });
});

describe("J-148 S1 the background starts and the process table", () => {
  it("finds the commands a line starts in the background, their wrappers left off", () => {
    expect(backgroundStarts("npm start &", false)).toEqual([["npm", "start"]]);
    expect(backgroundStarts("nohup node server.js > log 2>&1", false)).toEqual([
      ["node", "server.js"],
    ]);
    expect(backgroundStarts("setsid -f python3 -m http.server 8000", false)).toEqual([
      ["python3", "-m", "http.server", "8000"],
    ]);
    expect(backgroundStarts(REPLAY, false)).toEqual([
      ["node", "--disable-warning=ExperimentalWarning", "$ROOT/src/main.ts"],
    ]);
    // A foreground command starts nothing that lasts; `&&` is no background.
    expect(backgroundStarts("npm test && npm run build", false)).toEqual([]);
    // A group run in the background marks its last command; `2>&1` stays one word.
    expect(backgroundStarts("(cd web && npm run dev > log 2>&1) &", false)).toEqual([
      ["npm", "run", "dev"],
    ]);
    // The harness's own background run starts every lasting command of the line.
    expect(backgroundStarts("cd web && npm run dev", true)).toEqual([["npm", "run", "dev"]]);
    // Codex runs a command under its shell's -c, read as a line of its own.
    expect(backgroundStarts("/bin/zsh -lc 'nohup npm start > log 2>&1 &'", false)).toEqual([
      ["npm", "start"],
    ]);
  });

  it("reads the process table's rows, each start from its elapsed time", () => {
    const now = Date.parse("2026-10-30T12:00:00Z");
    const rows = parseProcessTable(
      [
        "    1     0 3-04:05:06 /sbin/launchd",
        "  400     1    1:02:03 node /usr/local/bin/npm start",
        "  500   400      00:04 node --disable-warning=ExperimentalWarning /w/src/main.ts",
        "not a row",
      ].join("\n"),
      now,
    );
    expect(rows.map((row) => [row.pid, row.ppid, (now - row.started) / 1000])).toEqual([
      [1, 0, ((3 * 24 + 4) * 60 + 5) * 60 + 6],
      [400, 1, 3723],
      [500, 400, 4],
    ]);
  });

  it("matches a started process by its program, literal arguments and start, never the owner's earlier one", () => {
    const now = 1_000_000_000;
    const since = now - 3000;
    const rows: readonly ProcessRow[] = [
      // The owner's own server, started an hour before.
      { pid: 100, ppid: 1, started: now - 3_600_000, command: "node /w/src/main.ts" },
      // The session's server, started after the command.
      {
        pid: 200,
        ppid: 1,
        started: now - 2000,
        command: "node --disable-warning=ExperimentalWarning /w/src/main.ts",
      },
      // The hook's own shell, which quotes the command.
      { pid: 300, ppid: 1, started: now - 2000, command: "/bin/zsh -c nohup node src/main.ts &" },
      { pid: 400, ppid: 1, started: now - 1000, command: "node /usr/local/bin/npm start" },
    ];
    expect(
      startedRows(
        ["node", "--disable-warning=ExperimentalWarning", "$ROOT/src/main.ts"],
        rows,
        since,
        now,
        new Set(),
      ).map((row) => row.pid),
    ).toEqual([200]);
    expect(
      startedRows(["npm", "start"], rows, since, now, new Set()).map((row) => row.pid),
    ).toEqual([400]);
    expect(startedRows(["npm", "start"], rows, since, now, new Set([400]))).toEqual([]);
  });

  it("reads descendants, ancestry, a reused pid and the status line", () => {
    const rows: readonly ProcessRow[] = [
      { pid: 10, ppid: 1, started: 0, command: "npm start" },
      { pid: 11, ppid: 10, started: 0, command: "node server.js" },
      { pid: 12, ppid: 11, started: 0, command: "esbuild --service" },
      { pid: 20, ppid: 12, started: 0, command: "greenline event" },
    ];
    expect(descendantsOf(10, rows)).toEqual([11, 12, 20]);
    expect([...ancestryOf(20, rows)]).toEqual([20, 12, 11, 10]);
    const started = { pid: 11, command: "node server.js", started: "", change: null };
    expect(stillRunning(started, rows)).toBe(true);
    expect(stillRunning({ ...started, command: "node other.js" }, rows)).toBe(false);
    // A pid reused by a process with the same command line, started later, is not the session's.
    expect(stillRunning({ ...started, started: new Date(60_000).toISOString() }, rows)).toBe(false);
    expect(stillRunning({ ...started, started: new Date(0).toISOString() }, rows)).toBe(true);
    // The session's pids reach a started process's descendants, its listener among them.
    expect([...sessionPids([{ ...started, pid: 10, command: "npm start" }], rows)]).toEqual([
      10, 11, 12, 20,
    ]);
    expect([...sessionPids([{ ...started, command: "gone" }], rows)]).toEqual([]);
    // greenline's own inspector, which `view` starts detached.
    expect(startsInspector("greenline view")).toBe(true);
    expect(startsInspector("npx greenline inspect --port 0 &")).toBe(true);
    expect(startsInspector("greenline status && echo view")).toBe(false);
    expect(runningLine([])).toBeUndefined();
    expect(runningLine([started, { ...started, pid: 12 }])).toBe(
      "running: 2 the session started, pid 11, 12; stop them by pid, and never a process the session did not start",
    );
  });
});

describe("J-151 S2 the change a close's tidy names", () => {
  it("reads the id after --change, in either form, through a wrapping shell", () => {
    expect(tidyChangeOf("greenline tidy --change 2026-10-29-overdue")).toBe("2026-10-29-overdue");
    expect(tidyChangeOf("greenline tidy --change=2026-10-29-overdue --json")).toBe(
      "2026-10-29-overdue",
    );
    expect(tidyChangeOf("cd app && npx greenline tidy --change 2026-10-29-x")).toBe("2026-10-29-x");
    expect(tidyChangeOf("greenline tidy")).toBe(undefined);
    expect(tidyChangeOf("greenline status --change 2026-10-29-x")).toBe(undefined);
  });
});
