import { programOf, SHELLS, shellCommands, unwrapped } from "./guardrails.ts";

/**
 * The processes a session starts and the kill guard (J-148 S1; `docs/SPEC.md`
 * §4, the hooks): a shell command that stops a process by its name or a
 * pattern, `pkill`, `killall`, `fuser -k` or a `kill` whose target is no
 * literal pid, is refused before the shell runs it, since the pattern
 * reaches the owner's own processes too, as the Linear replay's
 * `pkill -f 'src/main.ts'` reached the owner's `npm start`; a `kill <pid>`
 * goes on for a pid the session started, or one the owner's words of the
 * turn name. A command the shell runs in the background, after `&`, under
 * `nohup` or `setsid`, or as the harness's own background run, is matched
 * against the process table by its program, its literal arguments and its
 * start, so the session's file names the processes it started and the
 * close stops them, never one started before the command. Pure: the shell
 * reads the process table and the session's file.
 */

/** One act of stopping processes a command line runs. */
export interface KillAct {
  /** By a name, a pattern, a port or an unknown target; or by literal pids. */
  readonly kind: "by-name" | "by-pid";
  /** The command's words as one line, as the refusal quotes them. */
  readonly command: string;
  /** The pids a `kill` names, for an act by pid. */
  readonly pids: readonly number[];
}

/** How deep a nested shell is read. */
const DEPTH = 6;

/** The options of `kill` that take the next word as their value. */
const KILL_VALUED = new Set(["-s", "-n"]);

/** A literal pid: a whole number above 1, never 0 or a group. */
const PID = /^[1-9]\d*$/;

/**
 * The act a `kill` command is, or undefined for one that stops nothing:
 * listing the signals or probing a pid with signal 0.
 */
function killOf(words: readonly string[], command: string): KillAct | undefined {
  const operands: string[] = [];
  let signalled = false;
  let probe = false;
  let ended = false;
  for (let at = 1; at < words.length; at += 1) {
    const word = words[at] ?? "";
    if (ended || !word.startsWith("-") || word === "-") {
      operands.push(word);
      continue;
    }
    if (word === "--") {
      ended = true;
      continue;
    }
    if (word === "-l" || word === "-L" || word === "--list") return undefined;
    if (KILL_VALUED.has(word)) {
      const value = words[at + 1] ?? "";
      if (value === "0") probe = true;
      signalled = true;
      at += 1;
      continue;
    }
    // After a signal, a negative number is a process group: no literal pid.
    if (signalled && /^-\d+$/.test(word)) {
      operands.push(word);
      continue;
    }
    if (word === "-0") probe = true;
    signalled = true;
  }
  if (probe) return undefined;
  const pids = operands.every((operand) => PID.test(operand))
    ? operands.map((operand) => Number(operand))
    : [];
  return pids.length > 0 && pids.length === operands.length
    ? { kind: "by-pid", command, pids }
    : { kind: "by-name", command, pids: [] };
}

/**
 * The acts of stopping processes a command line runs, read the way the
 * guardrails read git's (`src/core/guardrails.ts`): every simple command,
 * a substitution's, `sh -c`'s and `eval`'s among them, each under its
 * wrappers, `xargs` and `sudo` included.
 * @param line the command line as the harness reported it
 * @param depth how deep a nested shell this line is; 0 for the harness's own
 * @returns the acts, in order
 */
export function killActs(line: string, depth = 0): readonly KillAct[] {
  if (depth > DEPTH) return [];
  const out: KillAct[] = [];
  for (const { words: simple } of shellCommands(line, depth)) {
    const words = unwrapped(simple);
    const program = programOf(words[0]);
    const command = words.join(" ");
    if (SHELLS.has(program) || program === "eval") {
      const flag = words.findIndex((word, at) => at > 0 && /^-[a-z]*c[a-z]*$/.test(word));
      const script =
        program === "eval" ? words.slice(1).join(" ") : flag === -1 ? undefined : words[flag + 1];
      if (script !== undefined) out.push(...killActs(script, depth + 1));
      continue;
    }
    if (program === "pkill" || program === "killall") {
      // `killall -l` lists the signals and stops nothing.
      if (!(program === "killall" && words.length === 2 && words[1] === "-l"))
        out.push({ kind: "by-name", command, pids: [] });
      continue;
    }
    if (program === "fuser") {
      if (words.slice(1).some((word) => /^-[a-zA-Z]*k/.test(word)))
        out.push({ kind: "by-name", command, pids: [] });
      continue;
    }
    if (program === "kill") {
      const act = killOf(words, command);
      if (act !== undefined) out.push(act);
    }
  }
  return out;
}

/** The rule a kill's refusal names last (J-144 S3). */
const KILL_RULE = "kill-by-name";

/** The pid form every refusal of the kill guard names. */
const PID_FORM = "stop a process by its pid, one the session started";

/**
 * The refusal of a kill, or undefined where it goes on: a kill by name or
 * pattern always, and a kill of a pid the session did not start unless the
 * owner's words of the turn name that pid.
 * @param act the act
 * @param started the pids the session started that still run as it started them
 * @param words the owner's words of the turn: the request and the cards' answers
 * @returns the refusal's one line, its rule last, or undefined
 */
export function killRefusal(
  act: KillAct,
  started: ReadonlySet<number>,
  words: readonly string[],
): string | undefined {
  if (act.kind === "by-name")
    return `\`${act.command}\` would stop every process its name, pattern or port matches, the owner's own among them; ${PID_FORM}; ${KILL_RULE}`;
  const named = new Set(words.flatMap((text) => text.split(/\D+/)).filter((part) => part !== ""));
  const foreign = act.pids.filter((pid) => !started.has(pid) && !named.has(String(pid)));
  if (foreign.length === 0) return undefined;
  const which = foreign.map(String).join(", ");
  return `\`${act.command}\` would stop ${foreign.length === 1 ? `process ${which}, which` : `processes ${which}, which`} this session did not start; ${PID_FORM}, or ask the owner and run it once their words name the pid; ${KILL_RULE}`;
}

/** The commands that start nothing that lasts, left out of a background run's starts. */
const PASSING = new Set([
  "cd",
  "pushd",
  "popd",
  "export",
  "echo",
  "printf",
  "sleep",
  "true",
  "false",
  "set",
  "source",
  ".",
  "test",
  "[",
  "wait",
  "disown",
  "exit",
  "trap",
  "unset",
  "read",
]);

/** The wrappers that start a command apart from the shell, whatever operator ends it. */
const DETACHING = new Set(["nohup", "setsid"]);

/** A word that holds no expansion or pattern, so it stands in the process's arguments as written. */
const LITERAL = /^[^$*?`~{}[\]]+$/;

/**
 * The commands a command line starts in the background, each its words as
 * the started process runs them: after the `&` operator, under `nohup` or
 * `setsid`, or every lasting command of a line the harness runs in the
 * background as a whole.
 * @param line the command line
 * @param whole whether the harness runs the whole line in the background
 * @returns each started command's words, its wrappers left off
 */
export function backgroundStarts(
  line: string,
  whole: boolean,
  depth = 0,
): readonly (readonly string[])[] {
  if (depth > DEPTH) return [];
  return shellCommands(line, depth).flatMap((command) => {
    const raw = command.words.filter((word) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word));
    const detached = DETACHING.has(programOf(raw[0]));
    let words = unwrapped(command.words);
    // A shell's script, `zsh -lc '…'` as Codex runs a command, is read as a line of its own.
    if (SHELLS.has(programOf(words[0]))) {
      const flag = words.findIndex((word, at) => at > 0 && /^-[a-z]*c[a-z]*$/.test(word));
      const script = flag === -1 ? undefined : words[flag + 1];
      if (script !== undefined)
        return backgroundStarts(script, whole || command.background === true, depth + 1);
    }
    while (DETACHING.has(programOf(words[0]))) {
      let at = 1;
      while ((words[at] ?? "").startsWith("-")) at += 1;
      words = unwrapped(words.slice(at));
    }
    const program = programOf(words[0]);
    if (program === "" || PASSING.has(program)) return [];
    return whole || command.background === true || detached ? [words] : [];
  });
}

/** One row of the process table. */
export interface ProcessRow {
  readonly pid: number;
  readonly ppid: number;
  /** When it started, in milliseconds since the epoch, to the second the table gives. */
  readonly started: number;
  /** Its command line as the table prints it. */
  readonly command: string;
}

/** An elapsed time as `ps` prints it, `[[dd-]hh:]mm:ss`, in seconds. */
function elapsedSeconds(text: string): number | undefined {
  const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(text);
  if (match === null) return undefined;
  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
  return ((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + Number(seconds);
}

/**
 * The process table `ps -axo pid=,ppid=,etime=,command=` prints, each row's
 * start read back from its elapsed time.
 * @param text the table
 * @param now when the table was read, in milliseconds since the epoch
 * @returns the rows that read, a malformed line left out
 */
export function parseProcessTable(text: string, now: number): readonly ProcessRow[] {
  return text.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*\S)\s*$/.exec(line);
    if (match === null) return [];
    const [, pid = "", ppid = "", etime = "", command = ""] = match;
    const elapsed = elapsedSeconds(etime);
    return elapsed === undefined
      ? []
      : [{ pid: Number(pid), ppid: Number(ppid), started: now - elapsed * 1000, command }];
  });
}

/** How far a start may read before the command's, since the table counts whole seconds. */
const START_SLACK = 1500;

/**
 * The rows a background command started: those that began between the
 * command's start and now, whose program is the command's, as the first
 * word or an interpreter's script, and whose arguments hold each literal
 * argument the command names, never a process that ran before it.
 * @param words the started command's words
 * @param rows the process table
 * @param since when the command started, in milliseconds since the epoch
 * @param now when the table was read
 * @param own the pids to leave out: the hook's own and its parents
 * @returns the matching rows
 */
export function startedRows(
  words: readonly string[],
  rows: readonly ProcessRow[],
  since: number,
  now: number,
  own: ReadonlySet<number>,
): readonly ProcessRow[] {
  const program = programOf(words[0]);
  if (program === "") return [];
  const literal = words.slice(1).filter((word) => LITERAL.test(word));
  return rows.filter((row) => {
    if (own.has(row.pid) || row.started < since - START_SLACK || row.started > now + 1000)
      return false;
    const tokens = row.command.split(/\s+/);
    if (programOf(tokens[0]) !== program && programOf(tokens[1]) !== program) return false;
    return literal.every((arg) =>
      tokens.some((token) => token === arg || token.endsWith(`/${arg}`)),
    );
  });
}

/**
 * The pids a process started, its children and theirs, read from the table.
 * @param pid the process
 * @param rows the process table
 * @returns its descendants, nearest first
 */
export function descendantsOf(pid: number, rows: readonly ProcessRow[]): readonly number[] {
  const out: number[] = [];
  const queue = [pid];
  for (let next = queue.shift(); next !== undefined; next = queue.shift())
    for (const row of rows)
      if (row.ppid === next && !out.includes(row.pid) && row.pid !== pid) {
        out.push(row.pid);
        queue.push(row.pid);
      }
  return out;
}

/**
 * The pids from a process up to the table's root: the hook's own process
 * and the parents that started it, which a match leaves out.
 * @param pid the hook's own pid
 * @param rows the process table
 * @returns the pid and its ancestors
 */
export function ancestryOf(pid: number, rows: readonly ProcessRow[]): ReadonlySet<number> {
  const out = new Set<number>();
  for (let at: number | undefined = pid; at !== undefined && at > 1 && !out.has(at);) {
    out.add(at);
    const current: number = at;
    at = rows.find((row) => row.pid === current)?.ppid;
  }
  return out;
}

/** One process a session started, as its file records it. */
export interface StartedProcess {
  readonly pid: number;
  /** Its command line as the table printed it when it was found, which a later reading must match. */
  readonly command: string;
  readonly started: string;
  /** The change open when it started, or null. */
  readonly change: string | null;
}

/**
 * Whether a recorded process still runs as it started: its pid in the
 * table with the same command line, so a pid the system reused is never
 * taken for it.
 * @param process the recorded process
 * @param rows the process table
 * @returns true while it runs
 */
export function stillRunning(process: StartedProcess, rows: readonly ProcessRow[]): boolean {
  const started = Date.parse(process.started);
  return rows.some(
    (row) =>
      row.pid === process.pid &&
      row.command === process.command &&
      (Number.isNaN(started) || Math.abs(row.started - started) <= START_SLACK + 1000),
  );
}

/**
 * The pids a kill may stop as the sessions': each recorded process that
 * still runs as it started, and its descendants, such as the listener a
 * server's script forked (J-148 S1).
 * @param started the processes the sessions' files name
 * @param rows the process table
 * @returns the pids
 */
export function sessionPids(
  started: readonly StartedProcess[],
  rows: readonly ProcessRow[],
): ReadonlySet<number> {
  const out = new Set<number>();
  for (const one of started)
    if (stillRunning(one, rows)) {
      out.add(one.pid);
      for (const pid of descendantsOf(one.pid, rows)) out.add(pid);
    }
  return out;
}

/**
 * Whether a command line starts greenline's inspector, `greenline view` or
 * `greenline inspect`, whose process the inspector's address file names,
 * since `view` starts it detached where no background operator shows it.
 * @param line the command line
 * @returns true where it does
 */
export function startsInspector(line: string): boolean {
  return shellCommands(line).some((command) => {
    const words = unwrapped(command.words);
    const at = words.findIndex((word) => programOf(word) === "greenline");
    const verb = at === -1 ? undefined : words.slice(at + 1).find((word) => !word.startsWith("-"));
    return verb === "view" || verb === "inspect";
  });
}

/**
 * The change a command line's `greenline tidy --change <id>` closes (J-151
 * S2), so the hook names the inspector the session started before tidy
 * stops the change's processes.
 * @param line the command line
 * @returns the change's id, or undefined for a line that runs no such tidy
 */
export function tidyChangeOf(line: string): string | undefined {
  for (const command of shellCommands(line)) {
    const words = unwrapped(command.words);
    const at = words.findIndex((word) => programOf(word) === "greenline");
    if (at === -1 || words.slice(at + 1).find((word) => !word.startsWith("-")) !== "tidy") continue;
    const rest = words.slice(at + 1);
    const flag = rest.findIndex((word) => word === "--change" || word.startsWith("--change="));
    const named = flag === -1 ? undefined : rest[flag];
    const id = named?.startsWith("--change=") ? named.slice("--change=".length) : rest[flag + 1];
    if (flag !== -1 && id !== undefined && id !== "") return id;
  }
  return undefined;
}

/**
 * The status's line for the processes the sessions started that still run.
 * @param running those processes
 * @returns the line, or undefined while none runs
 */
export function runningLine(running: readonly StartedProcess[]): string | undefined {
  if (running.length === 0) return undefined;
  const pids = running.map((process) => String(process.pid));
  return `running: ${String(running.length)} the session started, pid ${pids.join(", ")}; stop them by pid, and never a process the session did not start`;
}
