import { Command, CommanderError } from "commander";
import type { OptionValues } from "commander";

/**
 * Command-line argument parsing (`docs/SPEC.md` §4). One canonical
 * spelling per flag, no aliases. Parsing never executes work; it only
 * turns argv into a typed request or a usage outcome.
 */

export type CommandName = "init" | "sync" | "doctor" | "status" | "inspect";

export interface RunRequest {
  readonly command: CommandName;
  readonly json: boolean;
  readonly dryRun: boolean;
  readonly yes: boolean;
  readonly targets: readonly string[] | undefined;
  readonly forceManaged: readonly string[];
  /** The inspector's port; undefined takes the default. */
  readonly port: number | undefined;
  readonly guidance?: string | undefined;
}

/** A request one of the workspace verbs runs; the inspector is served by the runner. */
export type WorkspaceRequest = RunRequest & { readonly command: Exclude<CommandName, "inspect"> };

export type CliInvocation =
  | { readonly kind: "run"; readonly request: RunRequest }
  | { readonly kind: "help"; readonly text: string }
  | { readonly kind: "version"; readonly text: string }
  | { readonly kind: "usage-error"; readonly message: string };

const VALID_TARGETS: readonly string[] = ["codex", "claude-code"];

interface Capture {
  out: string;
  err: string;
}

function collectList(value: string, previous: readonly string[]): readonly string[] {
  return [...previous, value];
}

interface OptionSnapshot {
  readonly json: boolean;
  readonly dryRun: boolean;
  readonly yes: boolean;
  readonly targets: readonly string[] | undefined;
  readonly forceManaged: readonly string[];
}

// Commander's OptionValues is an index-signature bag; the strictness set
// (noPropertyAccessFromIndexSignature) demands bracket access, so reading
// it happens here in one place.
function snapshotOptions(options: OptionValues): OptionSnapshot {
  const targetsRaw: unknown = options["targets"];
  const forceManagedRaw: unknown = options["forceManaged"];
  // SAFETY: the --force-managed option is defined with collectList and a []
  // default, so commander only ever stores a string array under that name.
  const forceManaged: readonly string[] =
    forceManagedRaw === undefined ? [] : (forceManagedRaw as readonly string[]);
  return {
    json: options["json"] === true,
    dryRun: options["dryRun"] === true,
    yes: options["yes"] === true,
    targets:
      targetsRaw === undefined
        ? undefined
        : String(targetsRaw)
            .split(",")
            .map((t: string): string => t.trim()),
    forceManaged,
  };
}

// The option set shared by commands that (re)generate managed output.
function addTargetedCommandOptions(command: Command): Command {
  return command
    .option("--dry-run", "plan only; write nothing")
    .option("--json", "emit the versioned JSON automation envelope")
    .option(
      "--force-managed <path>",
      "overwrite this conflicting managed path, or remove this orphan (repeatable)",
      collectList,
      [],
    );
}

function buildProgram(
  version: string,
  capture: Capture,
  setRequest: (request: RunRequest) => void,
): Command {
  const program = new Command();
  program
    .name("greenline")
    .description("Initialize and maintain a greenline dual-harness workspace")
    .version(version)
    .exitOverride()
    .showHelpAfterError("(run 'greenline --help')");
  program.configureOutput({
    writeOut: (chunk: string): void => {
      capture.out += chunk;
    },
    writeErr: (chunk: string): void => {
      capture.err += chunk;
    },
  });
  const init = program
    .command("init")
    .description("Initialize this Git repository as a greenline workspace")
    .option("--yes", "accept defaults: both harness trees, guidance explicitly unconfigured")
    .option("--guidance <provider|none>", "guidance provider URL, or none (asked when absent)")
    .option(
      "--targets <targets>",
      "harness trees to install, comma-separated: codex, claude-code (asked at a terminal when absent)",
    );
  addTargetedCommandOptions(init);
  init.action((options: OptionValues): void => {
    const flags = snapshotOptions(options);
    setRequest({
      command: "init",
      json: flags.json,
      dryRun: flags.dryRun,
      yes: flags.yes,
      targets: flags.targets,
      forceManaged: flags.forceManaged,
      port: undefined,
      guidance: options["guidance"] === undefined ? undefined : String(options["guidance"]),
    });
  });
  const sync = program
    .command("sync")
    .description("Regenerate all managed output; report conflicts");
  addTargetedCommandOptions(sync);
  sync.action((options: OptionValues): void => {
    const flags = snapshotOptions(options);
    setRequest({
      command: "sync",
      json: flags.json,
      dryRun: flags.dryRun,
      yes: false,
      targets: undefined,
      forceManaged: flags.forceManaged,
      port: undefined,
    });
  });
  program
    .command("doctor")
    .description("Validate environment, manifest, lock, and managed files")
    .option("--json", "emit the versioned JSON automation envelope")
    .action((options: OptionValues): void => {
      const flags = snapshotOptions(options);
      setRequest({
        command: "doctor",
        json: flags.json,
        dryRun: false,
        yes: false,
        targets: undefined,
        forceManaged: [],
        port: undefined,
      });
    });
  program
    .command("status")
    .description("Show durable work with the same structural verdict as doctor")
    .option("--json", "emit the versioned JSON automation envelope with the view")
    .action((options: OptionValues): void => {
      const flags = snapshotOptions(options);
      setRequest({
        command: "status",
        json: flags.json,
        dryRun: false,
        yes: false,
        targets: undefined,
        forceManaged: [],
        port: undefined,
      });
    });
  program
    .command("inspect")
    .description("Read work and receipts; edit local policy in the localhost inspector")
    .option("--port <port>", "the port to listen on (default 7433)")
    .action((options: OptionValues): void => {
      const portRaw: unknown = options["port"];
      const base: RunRequest = {
        command: "inspect",
        json: options["json"] === true,
        dryRun: false,
        yes: false,
        targets: undefined,
        forceManaged: [],
        port: portRaw === undefined ? undefined : Number(portRaw),
      };
      setRequest(base);
    });
  // The entrypoint dispatches these groups to their own parsers before workspace parsing.
  program.command("guidance").description("Retrieve guidance; use guidance --help for operations");
  program
    .command("evidence <paths...>")
    .description("Return exact file references; use evidence --help for flags");
  return program;
}

/** Parse argv into a typed invocation. Never executes command work. */
export function parseArgs(argv: readonly string[], version: string): CliInvocation {
  const capture: Capture = { out: "", err: "" };
  let request: RunRequest | undefined;
  const program: Command = buildProgram(version, capture, (r: RunRequest): void => {
    request = r;
  });
  try {
    // `from: "user"`: argv is already the raw user arguments (we call with
    // process.argv.slice(2)); commander's default expects the full process
    // argv shape and would otherwise slice our real arguments away.
    const input =
      argv.length > 1 && argv.every((value) => value === "help") ? ["--help"] : [...argv];
    program.parse(input, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      if (
        error.code === "commander.helpDisplayed" ||
        (error.code === "commander.help" && error.exitCode === 0)
      )
        return { kind: "help", text: capture.out };
      if (error.code === "commander.version") return { kind: "version", text: capture.out };
      const detail =
        error.code === "commander.help"
          ? "no command given; run 'greenline --help'"
          : error.message === ""
            ? capture.err.trim()
            : error.message;
      return { kind: "usage-error", message: detail === "" ? "invalid arguments" : detail };
    }
    throw error;
  }
  if (request === undefined) return { kind: "usage-error", message: "no command given" };
  if (request.targets !== undefined) {
    for (const target of request.targets) {
      if (!VALID_TARGETS.includes(target)) {
        return {
          kind: "usage-error",
          message: `unknown target '${target}' (expected codex or claude-code)`,
        };
      }
    }
  }
  return { kind: "run", request };
}
