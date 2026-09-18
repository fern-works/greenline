import { parseArgs, type CliInvocation, type WorkspaceRequest } from "./args.ts";
import { runCommand, runUnavailableInstallation } from "./commands.ts";
import type { CliEnvironment } from "./command-environment.ts";
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
      const outcome = runCommand(request, env);
      const base = {
        schemaVersion: 1 as const,
        command: invocation.request.command,
        ok: outcome.ok,
        effects: outcome.effects,
        diagnostics: outcome.diagnostics,
      };
      const viewed: Envelope = outcome.view === undefined ? base : { ...base, view: outcome.view };
      const ruled: Envelope =
        outcome.houseRulings === undefined
          ? viewed
          : { ...viewed, houseRulings: outcome.houseRulings };
      const envelope: Envelope =
        outcome.ledger === undefined ? ruled : { ...ruled, ledger: outcome.ledger };
      if (invocation.request.json) {
        writeEnvelope(writer, envelope);
      } else {
        writeHumanResult(writer, envelope, outcome.text);
      }
      return envelope.ok ? EXIT_OK : EXIT_FAILURE;
    }
  }
}
