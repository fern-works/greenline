import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { constants } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import type { StdioOptions } from "node:child_process";
import type { Result } from "../../commons/result.ts";
import type { ContractParseFailed } from "../../core/contract.ts";
import {
  factsFileName,
  finishedFacts,
  isFactsFileName,
  markedProbe,
  parseFacts,
  serializeFacts,
  startedFacts,
  type CheckFacts,
  type CheckOutcome,
} from "../../core/facts.ts";
import type { Installation } from "../../core/installation.ts";
import { currentStep, parseRecordForm, type ChangeRecord } from "../../core/change.ts";
import { depthOf, freshAgents, type StepName } from "../../core/modes.ts";
import { listChangeRecords, scratchFolder } from "../changes.ts";
import { headCommit, workingTreeId } from "../code-tree.ts";
import { atomicWriteFile } from "../fs/io.ts";
import { findGitRoot } from "../git.ts";
import { resolveCheckExecutable, runCheckProcess } from "../process.ts";
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, type CliWriter } from "./output.ts";
import { isRepositoryPath } from "../../commons/repository-path.ts";
import {
  checkWhere,
  declaredForRun,
  declaredWith,
  ROOT_DIR,
  type DeclaredCheck,
} from "../../core/checks.ts";
import { serializeManifest } from "../../core/manifest.ts";
import { createNodeFileIo } from "../fs/io.ts";
import { withWorkspaceWrite } from "../fs/workspace-write.ts";
import { readRepositoryManifest } from "../repository-state.ts";
import { declaredChecks, workspaceManifest } from "../hooks.ts";

/**
 * `greenline check [--change <id>] [--step <step> [--round <n>]] -- <command>`
 * (`workshop/components/cli-contracts.md`, `docs/SPEC.md` section 4): run
 * one repository command for a change, with no shell, at the repository
 * root or, for a command a declared check matches, in that check's
 * directory, its output shown as it runs and never kept, and write its facts
 * under the change's folder, in a new file that names the newest fact before
 * it and never writes over one already standing. Without `--change` the one
 * open change is taken, and without `--step` the step its record is in, as
 * `status` reads it, so `greenline check -- <command>` records what the long
 * form does. `--round <n>`, given with `--step`, names a fresh agent by the
 * number its brief gives it: the command runs with `TMPDIR`, `TMP` and
 * `TEMP` set to that agent's scratch folder, `.greenline/tmp/<id>/<step>-<n>/`,
 * which it makes, so no working file of the agent's lands in the host's
 * temporary directory. The exit code is the
 * command's own when it ran; a refusal runs nothing, writes nothing and exits
 * with the usage code. `--probe <fact>` runs nothing: it marks a fact the
 * change's folder holds as a probe recorded by mistake, which `status` then
 * leaves out of the change's checks.
 */

/** What the verb needs beyond its arguments. */
export interface CheckEnvironment {
  readonly cwd: string;
  /** The installation, read only once the arguments are valid, so help needs none. */
  readonly installation: () => Result<Installation, ContractParseFailed>;
  /** Passed to the command as it is. */
  readonly environment: NodeJS.ProcessEnv;
  /** The command's streams: `inherit` in the CLI, so its output goes straight to the terminal. */
  readonly stdio: StdioOptions;
  /** Aborted when greenline itself is sent SIGTERM, to pass it on to the command. */
  readonly terminate?: AbortSignal | undefined;
  /** Aborted when a Ctrl-C reaches greenline; one that comes before the command starts stops the run. */
  readonly interrupted?: AbortSignal | undefined;
  /** The facts file's name for a run that starts at the given time; a test names one, the CLI makes a new one. */
  readonly factsFile?: ((startedAt: string) => string) | undefined;
}

const USAGE = [
  "Usage: greenline check [--change <id>] [--step <step> [--round <n>]] -- <command> [args...]",
  "       greenline check [--change <id>] --probe <fact>",
  "       greenline check --declare [--name <name>] [--dir <dir>] -- <command> [args...]",
  "",
  "Run one repository command for a change and record its facts under",
  ".greenline/ledger/<id>/checks/: the arguments, the outcome, the duration,",
  "the commit, the tree id of the code outside .greenline/ and the installation's",
  "revision. The command runs with no shell at the repository root, or in the",
  "directory of the declared check it matches; its output is shown as it runs",
  "and is never stored. The arguments are stored as given,",
  "so never pass a secret as one. Each run's facts go to a new file that names",
  "the newest fact before it; a recorded fact is never written over, removed or",
  "edited by hand, and a rerun records a new one.",
  "",
  "Every run of a check on the change's code goes through check, its red runs",
  "included: 'greenline check -- npm test' records it for the open change at the",
  "step its record is in. A run whose green the change never claims, a probe,",
  "runs plainly; one recorded by mistake is marked with --probe.",
  "",
  "Options:",
  "  --change <id>   the change the check belongs to (default: the only open change)",
  "  --step <step>   the step of the modes definition the check belongs to",
  "                  (default: the step the record is in: the one its next line",
  "                  names, else its first required section not yet written)",
  "  --round <n>     a fresh agent's number, given with the --step its brief",
  "                  names: the command runs with TMPDIR, TMP and TEMP set to",
  "                  the agent's scratch folder, .greenline/tmp/<id>/<step>-<n>/",
  "  --probe <fact>  run nothing: mark a recorded fact, by its file name or its",
  "                  path from the repository root, as a probe run as a check by",
  "                  mistake, a run whose green the change never claims; status",
  "                  leaves it out of the checks",
  "  --declare       run nothing: add the command to the checks the manifest",
  "                  declares, which a recorded command is matched against and",
  "                  the close is read by; --name names it (default: made from",
  "                  the command) and --dir gives its directory (default: .)",
  "  -h, --help      show this help",
  "",
].join("\n");

/** A parsed invocation, or the reason it is refused. */
type Parsed =
  | { readonly kind: "help" }
  | {
      readonly kind: "run";
      readonly change: string | undefined;
      readonly step: string | undefined;
      /** A fresh agent's number, given with its step. */
      readonly round: number | undefined;
      readonly command: readonly string[];
    }
  | { readonly kind: "probe"; readonly change: string | undefined; readonly fact: string }
  | {
      readonly kind: "declare";
      readonly command: string;
      readonly name: string | undefined;
      readonly dir: string;
    }
  | { readonly kind: "refused"; readonly message: string };

/** The options that take a value. */
const VALUED: readonly string[] = ["--change", "--step", "--round", "--probe", "--name", "--dir"];

function parseCheckArgs(argv: readonly string[]): Parsed {
  const separator = argv.indexOf("--");
  const options = separator === -1 ? argv : argv.slice(0, separator);
  const values = new Map<string, string>();
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index] ?? "";
    if (option === "--help" || option === "-h") return { kind: "help" };
    if (option === "--declare") {
      values.set(option, "");
      continue;
    }
    const value = options[index + 1];
    if (VALUED.includes(option) && value !== undefined && value !== "") {
      values.set(option, value);
      index += 1;
      continue;
    }
    return {
      kind: "refused",
      message: VALUED.includes(option)
        ? `${option} needs a value`
        : `unknown argument '${option}'; put the command after '--'`,
    };
  }
  const change = values.get("--change");
  const step = values.get("--step");
  const fact = values.get("--probe");
  const round = values.get("--round");
  if (round !== undefined && step === undefined)
    return {
      kind: "refused",
      message:
        "--round names a fresh agent by its number and is given with the --step its brief names",
    };
  if (round !== undefined && !/^[1-9]\d*$/.test(round))
    return {
      kind: "refused",
      message: "--round is a number from 1, the one the agent's brief names",
    };
  if (values.has("--declare"))
    return declaration(values, separator === -1 ? [] : argv.slice(separator + 1));
  if (values.has("--name") || values.has("--dir"))
    return { kind: "refused", message: "--name and --dir are given with --declare" };
  if (fact !== undefined)
    return separator === -1 && step === undefined
      ? { kind: "probe", change, fact }
      : {
          kind: "refused",
          message:
            "--probe marks a recorded fact and runs nothing; give it no command and no --step",
        };
  const command = separator === -1 ? [] : argv.slice(separator + 1);
  if (command.length === 0 || command[0] === "")
    return { kind: "refused", message: "no command given; write it after '--'" };
  return {
    kind: "run",
    change,
    step,
    round: round === undefined ? undefined : Number(round),
    command,
  };
}

/** A `--declare` invocation: the command after `--`, as one line of text, with its name and directory. */
function declaration(values: ReadonlyMap<string, string>, command: readonly string[]): Parsed {
  const others = ["--change", "--step", "--round", "--probe"].filter((option) =>
    values.has(option),
  );
  if (others.length > 0)
    return {
      kind: "refused",
      message: `--declare adds a check to the manifest and runs nothing; give it no ${others.join(" or ")}`,
    };
  const text = command.join(" ").trim();
  if (text === "" || text.includes("\n"))
    return { kind: "refused", message: "--declare needs the command after '--', on one line" };
  const dir = values.get("--dir") ?? ROOT_DIR;
  if (dir !== ROOT_DIR && !isRepositoryPath(dir))
    return {
      kind: "refused",
      message: `--dir is '.' or a path inside the repository, not '${dir}'`,
    };
  return { kind: "declare", command: text, name: values.get("--name"), dir };
}

/**
 * Add a check to the manifest's declared checks, under the writer lock, and
 * say what it is declared as; a command already declared there is left as
 * it is.
 * @param root the repository root
 * @param parsed the declaration
 * @param writer greenline's own streams
 * @returns the exit code
 */
function declareCheck(
  root: string,
  parsed: Extract<Parsed, { readonly kind: "declare" }>,
  writer: CliWriter,
): number {
  const io = createNodeFileIo();
  const written = withWorkspaceWrite(root, () => {
    const manifest = readRepositoryManifest(root, io);
    if (manifest._tag === "err")
      return `the manifest cannot be read, so no check is declared: ${manifest.error.issues
        .map((issue) => issue.message)
        .join("; ")}`;
    const declared = declaredWith(manifest.value.checks, parsed.command, parsed.dir, parsed.name);
    if (!declared.added) {
      writer.stderr.write(
        `greenline check: '${parsed.command}' is declared already, as '${declared.check.name}'\n`,
      );
      return undefined;
    }
    const saved = atomicWriteFile(
      join(root, ".greenline", "manifest.json"),
      serializeManifest({ ...manifest.value, checks: declared.checks }),
    );
    if (saved._tag === "err") return `the manifest cannot be written: ${saved.error.message}`;
    writer.stderr.write(
      `greenline check: declared '${declared.check.name}': ${checkWhere(declared.check)}; ${runForm(declared.check)}\n`,
    );
    return undefined;
  });
  const failure = written._tag === "err" ? written.error.message : written.value;
  if (failure === undefined) return EXIT_OK;
  writer.stderr.write(`greenline check: ${failure}\n`);
  return EXIT_FAILURE;
}

/**
 * How a declared check's run is recorded, as `--declare` says it: the short
 * form, which runs it in the check's directory.
 * @param check the declared check
 * @returns the sentence
 */
function runForm(check: DeclaredCheck): string {
  return `a run of it is recorded with greenline check -- ${check.command}${check.dir === ROOT_DIR ? "" : `, which runs it in ${check.dir}`}`;
}

/** A check's directory as a refusal names it. */
function placeOf(check: DeclaredCheck): string {
  return check.dir === ROOT_DIR ? "at the root" : `in ${check.dir}`;
}

/** Whether a path names a directory. */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** The newest facts file a change's folder holds, by its name, which sorts by start time; none when it holds none. */
function newestFact(folder: string): string | undefined {
  try {
    if (!existsSync(folder)) return undefined;
    return readdirSync(folder).filter(isFactsFileName).sort().at(-1);
  } catch {
    return undefined;
  }
}

/** Whether `--probe` marked a run's facts while it ran, so its completion keeps the mark. */
function markedWhileRunning(path: string): boolean {
  try {
    const now = parseFacts(readFileSync(path, "utf8"), path);
    return now._tag === "ok" && now.value.probe === true;
  } catch {
    return false;
  }
}

/**
 * Mark one recorded fact of a change as a probe, its other fields as they
 * are; a fact already marked is left alone.
 * @param root the repository root, which a fact's path is read from, as check prints it
 * @param change the change whose folder holds the fact
 * @param given the fact as named: its file name, or its path
 * @param writer greenline's own streams
 * @returns the exit code
 */
function markProbe(root: string, change: string, given: string, writer: CliWriter): number {
  const folder = join(".greenline", "ledger", change, "checks");
  const named =
    given.includes("/") || given.includes(sep)
      ? relative(root, resolve(root, given))
      : join(folder, given);
  const name = basename(named);
  const path = join(root, named);
  if (named !== join(folder, name) || !isFactsFileName(name) || !existsSync(path)) {
    writer.stderr.write(
      `greenline check: no facts file '${given}' among the checks of '${change}'\n`,
    );
    return EXIT_USAGE;
  }
  const shown = [".greenline", "ledger", change, "checks", name].join("/");
  const parsed = parseFacts(readFileSync(path, "utf8"), shown);
  if (parsed._tag === "err") {
    const issues = parsed.error.issues
      .map((issue) => (issue.path === "" ? issue.message : `${issue.path}: ${issue.message}`))
      .join("; ");
    writer.stderr.write(
      `greenline check: the facts file ${shown} does not parse, so it cannot be marked: ${issues}\n`,
    );
    return EXIT_USAGE;
  }
  if (parsed.value.probe === true) {
    writer.stderr.write(`greenline check: ${shown} is already marked a probe\n`);
    return EXIT_OK;
  }
  const written = atomicWriteFile(path, serializeFacts(markedProbe(parsed.value)));
  if (written._tag === "err") {
    writer.stderr.write(
      `greenline check: ${shown} could not be marked: ${written.error.message}\n`,
    );
    return EXIT_FAILURE;
  }
  writer.stderr.write(
    `greenline check: ${shown} marked a probe; status leaves it out of the change's checks\n`,
  );
  return EXIT_OK;
}

/** Whether the plan a record names has a tickets file, as status reads it for the record's required sections. */
function ticketsFileOf(root: string, record: ChangeRecord): "present" | "absent" {
  const plan = record.belongs?.plan;
  if (plan === undefined) return "absent";
  try {
    return statSync(join(root, ".greenline", "plans", plan, "tickets.md")).isFile()
      ? "present"
      : "absent";
  } catch {
    return "absent";
  }
}

/** The exit code a shell gives a command ended by a signal: 128 plus the signal's number. */
function signalExitCode(signal: string): number {
  const number: unknown = Object.entries(constants.signals).find(([name]) => name === signal)?.[1];
  return 128 + (Number.isInteger(number) ? Number(number) : 0);
}

/**
 * Run `greenline check`.
 * @param argv the arguments after `check`
 * @param writer greenline's own streams, for its refusals and its closing line
 * @param env where it runs and what it reads
 * @returns the command's exit code when it ran, 2 for a refusal, 1 when greenline itself failed
 */
export async function runCheckCli(
  argv: readonly string[],
  writer: CliWriter,
  env: CheckEnvironment,
): Promise<number> {
  const refuse = (message: string): number => {
    writer.stderr.write(`greenline check: ${message}\n`);
    return EXIT_USAGE;
  };
  const failed = (message: string): number => {
    writer.stderr.write(`greenline check: ${message}\n`);
    return EXIT_FAILURE;
  };
  const parsed = parseCheckArgs(argv);
  if (parsed.kind === "help") {
    writer.stdout.write(USAGE);
    return EXIT_OK;
  }
  if (parsed.kind === "refused") return refuse(parsed.message);
  const root = findGitRoot(env.cwd);
  if (root === undefined) return refuse("check runs inside a Git repository");
  if (parsed.kind === "declare") return declareCheck(root, parsed, writer);
  const installation = env.installation();
  if (installation._tag === "err")
    return failed(
      `the installation is unavailable, so the modes cannot be read (GL0140): ${installation.error.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  const definition = installation.value.modes;

  const listed = listChangeRecords(root, definition);
  if (listed._tag === "err") return failed(listed.error.issues[0]?.message ?? "unreadable ledger");
  let change: string;
  let record: ChangeRecord;
  if (parsed.change !== undefined) {
    const entry = listed.value.find((candidate) => candidate.id === parsed.change);
    if (entry === undefined)
      return refuse(`no change record '${parsed.change}' in .greenline/ledger/`);
    if (entry.record._tag === "err")
      return refuse(
        `the change record '${entry.id}' does not parse: ${entry.record.error.issues
          .map((issue) => (issue.path === "" ? issue.message : `${issue.path}: ${issue.message}`))
          .join("; ")}`,
      );
    change = entry.id;
    record = entry.record.value;
  } else {
    // A finished record is history: one that reads for its form as done or
    // dropped is never re-judged against the current modes, so only an open,
    // stopped or unreadable record that does not parse hides the open change.
    const broken = listed.value.filter((entry) => {
      if (entry.record._tag === "ok") return false;
      const form =
        entry.text === undefined ? undefined : parseRecordForm(`${entry.id}.md`, entry.text);
      const state = form?._tag === "ok" ? form.value.position.state : undefined;
      return state !== "done" && state !== "dropped";
    });
    if (broken.length > 0)
      return refuse(
        `the change records ${broken.map((entry) => `'${entry.id}'`).join(", ")} do not parse, so the open change is unknown; name it with --change`,
      );
    const open = listed.value.flatMap((entry) =>
      entry.record._tag === "ok" && entry.record.value.position.state === "open"
        ? [{ id: entry.id, record: entry.record.value }]
        : [],
    );
    const only = open[0];
    if (only === undefined) return refuse("no change is open; name one with --change");
    if (open.length > 1)
      return refuse(
        `several changes are open (${open.map((entry) => entry.id).join(", ")}); name one with --change`,
      );
    change = only.id;
    record = only.record;
  }
  if (parsed.kind === "probe") return markProbe(root, change, parsed.fact, writer);

  if (parsed.step !== undefined && !definition.steps.some((step) => step.name === parsed.step))
    return refuse(
      `unknown step '${parsed.step}'; the steps are ${definition.steps.map((step) => step.name).join(", ")}`,
    );
  // Without --step, the step an open or stopped record is in, read as status
  // reads it; a finished record is in no step.
  const unfinished = record.position.state === "open" || record.position.state === "stopped";
  const step =
    parsed.step ??
    (unfinished
      ? currentStep(definition, record, { ticketsFile: ticketsFileOf(root, record) })
      : undefined);
  const inferred = parsed.step === undefined && step !== undefined;
  // A fresh agent's run: its step runs at a depth that starts fresh agents, and its number is one that depth gives.
  let scratch: string | undefined;
  if (parsed.round !== undefined && step !== undefined) {
    const mode = definition.modes.find((candidate) => candidate.name === record.mode);
    if (mode === undefined) return refuse(`the record's mode '${record.mode}' is not a mode`);
    // SAFETY: the step was checked against the definition's steps above.
    const depth = depthOf(mode, step as StepName);
    const most = freshAgents(depth);
    if (most === 0)
      return refuse(
        `--round names a fresh agent, and the ${step} step runs at the ${depth.depth} depth under ${mode.name}, where none is started`,
      );
    const unit = depth.depth === "looped" ? "round" : "agent";
    if (parsed.round > most)
      return refuse(
        `${step} under ${mode.name} gives ${String(most)} ${unit}${most === 1 ? "" : "s"}, so --round is 1 to ${String(most)}`,
      );
    scratch = scratchFolder(root, change, step, parsed.round);
  }
  // A command a declared check matches runs in that check's directory, the one `check` was started from deciding between several.
  const text = parsed.command.join(" ");
  const from = relative(root, env.cwd).split(sep).join("/");
  const declaration = declaredForRun(
    declaredChecks(workspaceManifest(root)),
    text,
    from === "" ? ROOT_DIR : from,
  );
  if (declaration.kind === "ambiguous") {
    const named = declaration.checks.map((check) => `'${check.name}' ${placeOf(check)}`);
    return refuse(
      `'${text}' is declared as ${named.slice(0, -1).join(", ")} and ${named.at(-1) ?? ""}; run greenline check from the directory of the one this run is, which runs it there`,
    );
  }
  const declared = declaration.kind === "declared" ? declaration.check : undefined;
  const runIn =
    declared === undefined || declared.dir === ROOT_DIR ? root : join(root, declared.dir);
  if (declared !== undefined && !isDirectory(runIn))
    return refuse(
      `the declared check '${declared.name}' runs in ${declared.dir}, which is no directory of the repository; correct the declaration in .greenline/manifest.json`,
    );
  const [command, ...args] = parsed.command;
  const file =
    command === undefined ? undefined : resolveCheckExecutable(command, runIn, env.environment);
  if (file === undefined)
    return refuse(
      `'${command ?? ""}' is not an executable from ${runIn === root ? "the repository root" : (declared?.dir ?? "")} or the PATH`,
    );

  // The facts exist before the command starts, so no run can end without them.
  const commit = headCommit(root);
  const tree = workingTreeId(root);
  // The git reads block the event loop, and a signal is read only when the loop
  // polls for I/O. Two chained immediates guarantee one poll between them
  // wherever this runs, so an interrupt that came during the reads is seen and
  // the run stops before anything starts.
  await new Promise<void>((done) => setImmediate(done));
  await new Promise<void>((done) => setImmediate(done));
  if (env.interrupted?.aborted === true) {
    writer.stderr.write("greenline check: interrupted before the command started; nothing ran\n");
    return 128 + constants.signals.SIGINT;
  }
  const startedAt = new Date().toISOString();
  const folder = join(root, ".greenline", "ledger", change, "checks");
  const name =
    env.factsFile?.(startedAt) ?? factsFileName(startedAt, randomBytes(3).toString("hex"));
  const path = join(folder, name);
  // A recorded fact is never written over: a rerun always gets a new file.
  if (existsSync(path))
    return failed(
      `the facts file ${relative(root, path)} already stands, and a recorded fact is never written over, so nothing ran; run the check again`,
    );
  const previous = newestFact(folder);
  const started: CheckFacts = startedFacts({
    arguments: parsed.command,
    step,
    startedAt,
    commit: commit.kind === "commit" ? commit.id : null,
    tree: tree.kind === "tree" ? tree.id : null,
    installation: installation.value.revision,
    previous,
    check: declared?.name,
    dir: runIn === root ? undefined : declared?.dir,
  });
  if (scratch !== undefined)
    try {
      mkdirSync(scratch, { recursive: true });
    } catch (error) {
      return failed(
        `the scratch folder ${relative(root, scratch)} cannot be made, so nothing ran: ${String(error)}`,
      );
    }
  const opened = atomicWriteFile(path, serializeFacts(started));
  if (opened._tag === "err")
    return failed(`the check's facts cannot be written, so nothing ran: ${opened.error.message}`);

  const begin = performance.now();
  const ended: CheckOutcome = await runCheckProcess(file, args, {
    cwd: runIn,
    // A fresh agent's command writes its temporary files into its own scratch folder.
    environment:
      scratch === undefined
        ? env.environment
        : { ...env.environment, TMPDIR: scratch, TMP: scratch, TEMP: scratch },
    stdio: env.stdio,
    terminate: env.terminate,
  });
  const durationMs = Math.max(0, Math.round(performance.now() - begin));
  const facts = relative(root, path);
  // The step read from the record is named beside the facts, so a wrong one is seen as it is written.
  const shown = `${facts}${inferred ? `; step ${step}, read from the record` : ""}${declared === undefined ? "" : `; the declared check '${declared.name}'${runIn === root ? "" : `, run in ${declared.dir}`}`}`;
  const finished = finishedFacts(started, ended, durationMs);
  const closed = atomicWriteFile(
    path,
    serializeFacts(markedWhileRunning(path) ? markedProbe(finished) : finished),
  );
  if (closed._tag === "err")
    return failed(
      `the command ended but its facts in ${facts} could not be completed: ${closed.error.message}`,
    );
  switch (ended.kind) {
    case "exited":
      writer.stderr.write(`greenline check: exit ${ended.code}; facts in ${shown}\n`);
      return ended.code;
    case "signalled":
      writer.stderr.write(`greenline check: ended by ${ended.signal}; facts in ${shown}\n`);
      return signalExitCode(ended.signal);
    case "unstarted":
      return failed(`the command could not start: ${ended.message}; facts in ${shown}`);
  }
}
