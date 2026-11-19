import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { parseJson } from "../core/contract.ts";
import { INSPECT_ADDRESS_FILE, parseInspectAddress } from "../core/inspect-address.ts";
import {
  ancestryOf,
  descendantsOf,
  parseProcessTable,
  runningLine,
  stillRunning,
  type ProcessRow,
  type StartedProcess,
} from "../core/processes.ts";
import { atomicWriteFile } from "./fs/io.ts";
import { sessionFileName } from "./skill-loads.ts";

/*
 * The processes a session started, on the disk (J-148 S1;
 * `src/core/processes.ts`): the process table read with `ps`, and each
 * session's file under `.greenline/tmp/sessions/`, a working file no commit
 * holds, naming each process the after-command hook found started with
 * the command line the table printed, so a pid the system reused later is
 * never taken for it. Where `ps` cannot run, as on Windows, nothing is
 * found and nothing is stopped.
 */

const SESSIONS = [".greenline", "tmp", "sessions"] as const;
const SUFFIX = ".processes.json";

const startedSchema = z.object({
  pid: z.number().int().min(2),
  command: z.string().min(1),
  started: z.string(),
  change: z.string().nullable(),
});

const fileSchema = z.object({ v: z.literal(1), processes: z.array(startedSchema) });

/** A session's file, or undefined where the id names no file. */
function sessionFile(root: string, session: string): string | undefined {
  const safe = sessionFileName(session);
  return safe === undefined ? undefined : join(root, ...SESSIONS, `${safe}${SUFFIX}`);
}

/** A file's processes, none where it is absent or does not read. */
function readFile(path: string): readonly StartedProcess[] {
  try {
    const read = fileSchema.safeParse(parseJson(readFileSync(path, "utf8")));
    return read.success ? read.data.processes : [];
  } catch {
    return [];
  }
}

/**
 * The process table as `ps` prints it now, or undefined where `ps` cannot run.
 * @returns the rows, and when they were read
 */
export function processTable():
  | { readonly rows: readonly ProcessRow[]; readonly at: number }
  | undefined {
  if (process.platform === "win32") return undefined;
  try {
    const text = execFileSync("ps", ["-axo", "pid=,ppid=,etime=,command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
      maxBuffer: 64 * 1024 * 1024,
    });
    const at = Date.now();
    return { rows: parseProcessTable(text, at), at };
  } catch {
    return undefined;
  }
}

/**
 * The pids to leave out of a match: this process and the parents that started it.
 * @param rows the process table
 * @returns the pids
 */
export function ownPids(rows: readonly ProcessRow[]): ReadonlySet<number> {
  return ancestryOf(process.pid, rows);
}

/**
 * Note processes a session started, after those its file names, a pid
 * already named with the same command left as it stands.
 * @param root the repository root
 * @param session the harness's session id
 * @param found the processes found started
 */
export function noteStarted(root: string, session: string, found: readonly StartedProcess[]): void {
  const path = sessionFile(root, session);
  if (path === undefined || found.length === 0) return;
  const before = readFile(path);
  // A process noted under no change takes the change a later note names, as a close's does (J-151 S2).
  const held = before.map((each) => {
    const same = found.find((one) => one.pid === each.pid && one.command === each.command);
    return same !== undefined && each.change === null && same.change !== null
      ? { ...each, change: same.change }
      : each;
  });
  const fresh = found.filter(
    (one) => !held.some((each) => each.pid === one.pid && each.command === one.command),
  );
  if (fresh.length === 0 && held.every((each, at) => each === before[at])) return;
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteFile(path, `${JSON.stringify({ v: 1, processes: [...held, ...fresh] })}\n`);
}

/**
 * Every process the sessions' files name, across the workspace's sessions.
 * @param root the repository root
 * @returns them, by file and order found
 */
export function allStarted(root: string): readonly StartedProcess[] {
  let names: readonly string[];
  try {
    names = readdirSync(join(root, ...SESSIONS)).filter((name) => name.endsWith(SUFFIX));
  } catch {
    return [];
  }
  return [...names].sort().flatMap((name) => readFile(join(root, ...SESSIONS, name)));
}

/**
 * The processes the sessions started that still run as they started.
 * @param root the repository root
 * @param rows the process table
 * @returns them, each once by pid
 */
function runningStarted(root: string, rows: readonly ProcessRow[]): readonly StartedProcess[] {
  const seen = new Set<number>();
  return allStarted(root).filter((one) => {
    if (seen.has(one.pid) || !stillRunning(one, rows)) return false;
    seen.add(one.pid);
    return true;
  });
}

/** One process the close stopped, as tidy names it. */
export interface StoppedProcess {
  readonly pid: number;
  readonly command: string;
  /** Whether it was the inspector its address file names. */
  readonly inspector: boolean;
}

/**
 * The inspector's row of the process table where it began after a
 * command's start, read through its address file's pid (J-148 S1).
 * @param root the repository root
 * @param rows the process table
 * @param since when the command started, in milliseconds since the epoch
 * @returns the row, or undefined where none serves or it ran before
 */
export function inspectorRow(
  root: string,
  rows: readonly ProcessRow[],
  since: number,
): ProcessRow | undefined {
  const pid = inspectorPid(root);
  const row = pid === undefined ? undefined : rows.find((each) => each.pid === pid);
  return row !== undefined && row.started >= since - 1500 ? row : undefined;
}

/** The inspector's pid its address file names, or undefined where none serves. */
function inspectorPid(root: string): number | undefined {
  try {
    return parseInspectAddress(readFileSync(join(root, INSPECT_ADDRESS_FILE), "utf8"))?.pid;
  } catch {
    return undefined;
  }
}

/**
 * Stop the processes a change's sessions started that still run, each with
 * its descendants, the inspector its address file names among them when a
 * session started it; a process no session started is never stopped.
 * @param root the repository root
 * @param change the change the close names
 * @returns the processes stopped, the inspector first
 */
export function stopStarted(root: string, change: string): readonly StoppedProcess[] {
  // No session noted a process of the change: the table is not read and nothing is stopped.
  if (!allStarted(root).some((one) => one.change === change)) return [];
  const table = processTable();
  if (table === undefined) return [];
  const own = ownPids(table.rows);
  const ours = runningStarted(root, table.rows).filter((one) => one.change === change);
  const reach = new Set<number>();
  for (const one of ours) {
    reach.add(one.pid);
    for (const pid of descendantsOf(one.pid, table.rows)) reach.add(pid);
  }
  for (const pid of own) reach.delete(pid);
  const inspector = inspectorPid(root);
  const stopped: StoppedProcess[] = [];
  const signal = (pid: number): boolean => {
    try {
      process.kill(pid, "SIGTERM");
      return true;
    } catch {
      return false;
    }
  };
  // The inspector the session started goes first, through its address file's pid.
  if (inspector !== undefined && reach.has(inspector) && signal(inspector)) {
    const row = table.rows.find((each) => each.pid === inspector);
    stopped.push({ pid: inspector, command: row?.command ?? "greenline inspect", inspector: true });
  }
  for (const one of ours)
    if (one.pid !== inspector && !own.has(one.pid) && signal(one.pid))
      stopped.push({ pid: one.pid, command: one.command, inspector: false });
  // Each descendant left, a server's workers among them.
  for (const pid of reach)
    if (pid !== inspector && !ours.some((one) => one.pid === pid)) signal(pid);
  return stopped;
}

/**
 * The status's line for the processes the sessions started that still run
 * (J-148 S1), and a newline; empty while none runs or the table cannot be read.
 * @param root the repository root
 * @returns the text
 */
export function runningText(root: string): string {
  // No session noted a process: the table is not read.
  if (allStarted(root).length === 0) return "";
  const table = processTable();
  if (table === undefined) return "";
  const line = runningLine(runningStarted(root, table.rows));
  return line === undefined ? "" : `${line}\n`;
}

/**
 * Note the inspector its address file names as one the session started,
 * where it began inside the session's turn (J-151 S2): a server Codex runs
 * past its call's yield gets no after-tool event while it serves, so its
 * turn's end, and a close's tidy before it runs, name it. The process
 * table is read only while the address file stands.
 * @param root the repository root
 * @param session the harness's session id
 * @param change the change it is noted under, null where none
 * @param since when the session's turn began, in milliseconds since the epoch
 */
export function noteServedInspector(
  root: string,
  session: string,
  change: string | null,
  since: number,
): void {
  if (!existsSync(join(root, INSPECT_ADDRESS_FILE))) return;
  const table = processTable();
  if (table === undefined) return;
  const row = inspectorRow(root, table.rows, since);
  if (row === undefined) return;
  noteStarted(root, session, [
    { pid: row.pid, command: row.command, started: new Date(row.started).toISOString(), change },
  ]);
}
