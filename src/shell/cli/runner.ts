import { parseArgs, type CliInvocation, type WorkspaceRequest } from "./args.ts";
import { installationUnavailable, runCommand, runUnavailableInstallation } from "./commands.ts";
import type { CliEnvironment } from "./command-environment.ts";
import { fail, type CommandOutcome } from "./command-outcome.ts";
import { runConnectorsChange, runConnectorsReport } from "./connectors.ts";
import type { ContractParseFailed } from "../../core/contract.ts";
import { serveInspector } from "../inspect/serve.ts";
import {
  EXIT_FAILURE,
  EXIT_OK,
  EXIT_USAGE,
  writeEnvelope,
  writeHumanResult,
  type CliWriter,
  type Envelope,
} from "./output.ts";

/** The versioned envelope of one outcome, carrying each factual field the outcome set. */
function envelopeOf(command: string, outcome: CommandOutcome): Envelope {
  const base: Envelope = {
    schemaVersion: 1,
    command,
    ok: outcome.ok,
    effects: outcome.effects,
    diagnostics: outcome.diagnostics,
  };
  const viewed: Envelope = outcome.view === undefined ? base : { ...base, view: outcome.view };
  const ruled: Envelope =
    outcome.houseRulings === undefined ? viewed : { ...viewed, houseRulings: outcome.houseRulings };
  const ledgered: Envelope =
    outcome.ledger === undefined ? ruled : { ...ruled, ledger: outcome.ledger };
  return outcome.connectors === undefined
    ? ledgered
    : { ...ledgered, connectors: outcome.connectors };
}

/** Render one outcome as the request asked and return its exit code. */
function report(
  writer: CliWriter,
  json: boolean,
  command: string,
  outcome: CommandOutcome,
): number {
  const envelope = envelopeOf(command, outcome);
  if (json) writeEnvelope(writer, envelope);
  else writeHumanResult(writer, envelope, outcome.text);
  return envelope.ok ? EXIT_OK : EXIT_FAILURE;
}

/**
 * The CLI's control flow: parse argv, dispatch, render output, return
 * the exit code. Pure of real streams so tests drive it through a
 * recording writer fed by an explicit environment.
 */
export function runCli(
  argv: readonly string[],
  writer: CliWriter,
  version: string,
  env:
    | CliEnvironment
    | (Omit<CliEnvironment, "installation"> & { readonly installationError: ContractParseFailed }),
): number {
  const invocation: CliInvocation = parseArgs(argv, version);
  switch (invocation.kind) {
    case "help":
      writer.stdout.write(invocation.text);
      return EXIT_OK;
    case "version":
      writer.stdout.write(invocation.text);
      return EXIT_OK;
    case "usage-error":
      writer.stderr.write(`greenline: ${invocation.message}\n`);
      writer.stderr.write("run 'greenline --help' for usage\n");
      return EXIT_USAGE;
    case "connectors": {
      const request = invocation.request;
      const command = `connectors ${request.operation}`;
      // List and status need only the manifest and the registry; a change needs the installation.
      if (request.operation === "list" || request.operation === "status")
        return report(writer, request.json, command, runConnectorsReport(request, env));
      const outcome =
        "installationError" in env
          ? fail([installationUnavailable(env.installationError)])
          : runConnectorsChange(request, env);
      return report(writer, request.json, command, outcome);
    }
    case "run": {
      if ("installationError" in env) {
        const outcome = runUnavailableInstallation(invocation.request, env, env.installationError);
        const { text, ...result } = outcome;
        const envelope: Envelope = {
          schemaVersion: 1,
          command: invocation.request.command,
          ...result,
        };
        if (invocation.request.json) writeEnvelope(writer, envelope);
        else writeHumanResult(writer, envelope, text);
        return EXIT_FAILURE;
      }
      if (invocation.request.command === "inspect") {
        return serveInspector(invocation.request.port, writer, env);
      }
      const request: WorkspaceRequest = {
        ...invocation.request,
        command: invocation.request.command,
      };
      return report(writer, invocation.request.json, request.command, runCommand(request, env));
    }
  }
}
