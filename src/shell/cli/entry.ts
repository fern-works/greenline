#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { runEvidenceCli } from "./evidence.ts";
import { runCli } from "./runner.ts";
import { runGuidanceCli } from "./guidance.ts";
import { Redacted } from "../../commons/redacted.ts";
import { parseArgs } from "./args.ts";
import type { CliEnvironment } from "./command-environment.ts";
import { CLI_VERSION } from "../version.ts";
import { loadInstallation } from "../installation.ts";
import { createTtyPrompt } from "./prompt.ts";
import type { ContractParseFailed } from "../../core/contract.ts";

const writer = { stdout: process.stdout, stderr: process.stderr };
const bundleDirectory = fileURLToPath(new URL("../corpus/", import.meta.url));

function writeGuidance(stream: NodeJS.WriteStream, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const failed = (error: Error): void => reject(error);
    stream.once("error", failed);
    stream.write(text, (error) => {
      if (error) reject(error);
      else {
        stream.removeListener("error", failed);
        resolve();
      }
    });
  });
}

async function main(): Promise<number> {
  const input = process.argv.slice(2);
  // These verbs own their parser; dispatch the advertised top-level help form to it.
  const argv =
    input[0] === "help" && (input[1] === "guidance" || input[1] === "evidence")
      ? [input[1], ...input.slice(2), "--help"]
      : input;
  const cwd = process.cwd();
  if (argv[0] === "evidence") return runEvidenceCli(argv.slice(1), writer, cwd);
  if (argv[0] === "guidance") {
    const key = process.env["GREENLINE_GUIDANCE_KEY"];
    const environment = key === undefined ? { cwd } : { cwd, credential: new Redacted(key) };
    return runGuidanceCli(
      argv.slice(1),
      {
        stdout: { write: (text) => writeGuidance(process.stdout, text) },
        stderr: { write: (text) => writeGuidance(process.stderr, text) },
      },
      environment,
    );
  }
  const unavailable = (installationError: ContractParseFailed): number =>
    runCli(argv, writer, CLI_VERSION, {
      cwd,
      version: CLI_VERSION,
      installationError,
    });
  const invocation = parseArgs(argv, CLI_VERSION);
  if (invocation.kind === "help" || invocation.kind === "version") {
    writer.stdout.write(invocation.text);
    return 0;
  }
  if (invocation.kind === "usage-error") {
    writer.stderr.write(`greenline: ${invocation.message}\n`);
    return 2;
  }
  const installation = loadInstallation(bundleDirectory);
  if (installation._tag === "err") return unavailable(installation.error);
  const environment: CliEnvironment = {
    cwd,
    version: CLI_VERSION,
    installation: installation.value,
  };
  const prompt = createTtyPrompt(process.stdin, process.stdout);
  return runCli(
    argv,
    writer,
    CLI_VERSION,
    prompt === undefined ? environment : { ...environment, prompt },
  );
}

process.exitCode = await main();
