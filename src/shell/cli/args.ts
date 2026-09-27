import { Command, CommanderError } from "commander";
import type { OptionValues } from "commander";
import { parseConnectorId, type ConnectorId } from "../../core/connectors/registry.ts";

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
}

/** A request one of the workspace verbs runs; the inspector is served by the runner. */
export type WorkspaceRequest = RunRequest & { readonly command: Exclude<CommandName, "inspect"> };

/** One `greenline connectors` operation; every id named is a registered one. */
export type ConnectorsRequest =
  | { readonly operation: "list"; readonly json: boolean }
  | { readonly operation: "status"; readonly json: boolean; readonly id: ConnectorId | undefined }
  | {
      readonly operation: "enable";
      readonly json: boolean;
      readonly dryRun: boolean;
      readonly forceManaged: readonly string[];
      readonly id: ConnectorId;
      readonly url: string;
      /** The executable flag as given; the connector supplies its default. */
      readonly executable: string | undefined;
    }
  | {
      readonly operation: "disable";
      readonly json: boolean;
      readonly dryRun: boolean;
      readonly forceManaged: readonly string[];
      readonly id: ConnectorId;
    };

export type CliInvocation =
  | { readonly kind: "run"; readonly request: RunRequest }
  | { readonly kind: "connectors"; readonly request: ConnectorsRequest }
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

/** A parsed connectors operation, or the registry's refusal of the id it named. */
type ConnectorsParse =
  | { readonly kind: "request"; readonly request: ConnectorsRequest }
  | { readonly kind: "refused"; readonly message: string };

/** Resolve a named id through the registry, which refuses an unknown id or a plugin. */
function withConnector(
  input: string,
  build: (id: ConnectorId) => ConnectorsRequest,
): ConnectorsParse {
  const id = parseConnectorId(input);
  return id._tag === "err"
    ? { kind: "refused", message: id.error.message }
    : { kind: "request", request: build(id.value) };
}

/**
 * The `connectors` group: list and status read the manifest; enable and
 * disable change it through the write planner, so they take the planner's
 * `--dry-run` and `--force-managed`.
 */
function addConnectorsCommands(program: Command, set: (parse: ConnectorsParse) => void): void {
  const connectors = program
    .command("connectors")
    .description("List, show, enable or disable an optional connector; none is enabled by default");
  // Operations are declared by usage string, so only the group reads as a
  // top-level command to the corpus-prose check.
  const operation = (usage: string, description: string): Command =>
    connectors
      .command(usage)
      .description(description)
      .option("--json", "emit the versioned JSON automation envelope");
  const planned = (command: Command): Command =>
    command
      .option("--dry-run", "plan only; write nothing")
      .option(
        "--force-managed <path>",
        "overwrite this conflicting managed path, or remove this edited file (repeatable)",
        collectList,
        [],
      );
  operation(
    "list",
    "List the registered connectors and whether this repository enabled them",
  ).action((options: OptionValues): void => {
    set({ kind: "request", request: { operation: "list", json: options["json"] === true } });
  });
  operation("status [id]", "Show a connector's installed configuration, read offline").action(
    (id: string | undefined, options: OptionValues): void => {
      const json = options["json"] === true;
      set(
        id === undefined
          ? { kind: "request", request: { operation: "status", json, id: undefined } }
          : withConnector(id, (connector) => ({ operation: "status", json, id: connector })),
      );
    },
  );
  planned(
    operation("enable <id>", "Enable a connector for this repository; nothing is installed or run")
      .requiredOption("--url <url>", "the endpoint the connector calls: HTTPS, or loopback HTTP")
      .option(
        "--executable <path>",
        "the connector's command on the PATH (default), or an absolute path",
      ),
  ).action((id: string, options: OptionValues): void => {
    const flags = snapshotOptions(options);
    const executable: unknown = options["executable"];
    set(
      withConnector(id, (connector) => ({
        operation: "enable",
        json: flags.json,
        dryRun: flags.dryRun,
        forceManaged: flags.forceManaged,
        id: connector,
        url: String(options["url"]),
        executable: executable === undefined ? undefined : String(executable),
      })),
    );
  });
  // The entrypoint dispatches `connectors call` to its own parser, as it does evidence.
  connectors
    .command("call")
    .description("Call a connector's read inside a recorded request; use connectors call --help");
  planned(
    operation(
      "disable <id>",
      "Disable a connector; its skill and pointer leave, receipts and your text stay",
    ),
  ).action((id: string, options: OptionValues): void => {
    const flags = snapshotOptions(options);
    set(
      withConnector(id, (connector) => ({
        operation: "disable",
        json: flags.json,
        dryRun: flags.dryRun,
        forceManaged: flags.forceManaged,
        id: connector,
      })),
    );
  });
}

function buildProgram(
  version: string,
  capture: Capture,
  setRequest: (request: RunRequest) => void,
  setConnectors: (parse: ConnectorsParse) => void,
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
    .option("--yes", "accept defaults: both harness trees")
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
  addConnectorsCommands(program, setConnectors);
  // The entrypoint dispatches this group to its own parser before workspace parsing.
  program
    .command("evidence <paths...>")
    .description("Return exact file references; use evidence --help for flags");
  return program;
}

/** Parse argv into a typed invocation. Never executes command work. */
export function parseArgs(argv: readonly string[], version: string): CliInvocation {
  const capture: Capture = { out: "", err: "" };
  let request: RunRequest | undefined;
  let connectors: ConnectorsParse | undefined;
  const program: Command = buildProgram(
    version,
    capture,
    (r: RunRequest): void => {
      request = r;
    },
    (parse: ConnectorsParse): void => {
      connectors = parse;
    },
  );
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
          ? argv[0] === "connectors"
            ? "connectors needs an operation: list, status, enable or disable"
            : "no command given; run 'greenline --help'"
          : error.message === ""
            ? capture.err.trim()
            : error.message;
      return { kind: "usage-error", message: detail === "" ? "invalid arguments" : detail };
    }
    throw error;
  }
  if (connectors !== undefined)
    return connectors.kind === "refused"
      ? { kind: "usage-error", message: connectors.message }
      : { kind: "connectors", request: connectors.request };
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
