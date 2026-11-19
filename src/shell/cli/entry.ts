#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isMainThread } from "node:worker_threads";
import { runBriefCli } from "./brief.ts";
import { runOpenCli } from "./open.ts";
import { runPictureCli } from "./picture.ts";
import { runResearchCli } from "./research.ts";
import { runCheckCli } from "./check.ts";
import { runDealCli } from "./deal.ts";
import { runMarkCli } from "./mark.ts";
import { detachedStarter, runViewCli } from "../inspect/view.ts";
import { runEventCli } from "./event.ts";
import { runHookCli } from "./hook.ts";
import { runConnectorsCallCli } from "./connectors-call.ts";
import { runCli } from "./runner.ts";
import { parseArgs } from "./args.ts";
import type { CliEnvironment } from "./command-environment.ts";
import { CLI_VERSION } from "../version.ts";
import { loadInstallation } from "../installation.ts";
import { createTtyPrompt } from "./prompt.ts";
import type { ContractParseFailed } from "../../core/contract.ts";
import type { Installation } from "../../core/installation.ts";
import type { ModesDefinition } from "../../core/modes.ts";
import { readsAsZsh } from "../../core/skill-loads.ts";

const writer = { stdout: process.stdout, stderr: process.stderr };
const bundleDirectory = fileURLToPath(new URL("../corpus/", import.meta.url));

function writeStream(stream: NodeJS.WriteStream, text: string): Promise<void> {
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
    input[0] === "help" &&
    (input[1] === "check" ||
      input[1] === "brief" ||
      input[1] === "open" ||
      input[1] === "picture" ||
      input[1] === "research" ||
      input[1] === "deal" ||
      input[1] === "mark" ||
      input[1] === "view")
      ? [input[1], "--help"]
      : input[0] === "help" && input[1] === "connectors" && input[2] === "call"
        ? ["connectors", "call", ...input.slice(3), "--help"]
        : input;
  const cwd = process.cwd();
  // The hooks run on every commit and every tool call, so they load the installation
  // only for the modes' order, which a standing choice under another mode than the
  // one proceed names needs, and for the modes definition at a turn's start with a
  // change open; stdin is read only by the hooks and events that take one.
  const stdin = (): string => {
    try {
      return readFileSync(0, "utf8");
    } catch {
      return "";
    }
  };
  const modes = (): readonly string[] | undefined => {
    const installation = loadInstallation(bundleDirectory);
    return installation._tag === "ok"
      ? installation.value.modes.modes.map((mode) => mode.name)
      : undefined;
  };
  // The modes definition, for the mirror's progress line, read only when a turn's start finds an open change.
  const line = (): ModesDefinition | undefined => {
    const installation = loadInstallation(bundleDirectory);
    return installation._tag === "ok" ? installation.value.modes : undefined;
  };
  if (argv[0] === "deal") return runDealCli(argv.slice(1), writer, cwd);
  if (argv[0] === "mark") return runMarkCli(argv.slice(1), writer, cwd);
  // The viewer's address of one artefact, starting this same CLI's inspector detached where none serves (J-142 S1).
  if (argv[0] === "view")
    return runViewCli(argv.slice(1), writer, {
      cwd,
      start: detachedStarter(fileURLToPath(import.meta.url)),
    });
  // The installation whole, for the situation and the skills a change owes (J-176 S1), read only where one is asked for.
  const installed = (): Installation | undefined => {
    const installation = loadInstallation(bundleDirectory);
    return installation._tag === "ok" ? installation.value : undefined;
  };
  if (argv[0] === "hook")
    return runHookCli(argv.slice(1), writer, {
      cwd,
      stdin,
      modes,
      line,
      installation: installed,
    });
  if (argv[0] === "event")
    return runEventCli(argv.slice(1), writer, {
      cwd,
      stdin,
      modes,
      line,
      installation: installed,
      // The shell the harness runs its lines in, as the hook's environment names it (J-207 S1).
      zsh: readsAsZsh(process.env["SHELL"], process.platform),
    });
  if (argv[0] === "brief")
    return runBriefCli(argv.slice(1), writer, {
      cwd,
      installation: () => loadInstallation(bundleDirectory),
    });
  if (argv[0] === "open")
    return runOpenCli(argv.slice(1), writer, {
      cwd,
      installation: () => loadInstallation(bundleDirectory),
    });
  if (argv[0] === "picture") return runPictureCli(argv.slice(1), writer, { cwd });
  if (argv[0] === "research") return runResearchCli(argv.slice(1), writer, cwd);
  if (argv[0] === "check") {
    // The command shares the terminal, so a Ctrl-C reaches it directly; greenline
    // stays alive to complete the facts, and a Ctrl-C before the command starts
    // stops the run. A SIGTERM sent to greenline alone, as a supervisor sends
    // it, is passed on to the command.
    const interruption = new AbortController();
    const interrupted = new AbortController();
    const onInterrupt = (): void => interrupted.abort();
    const onTerminate = (): void => interruption.abort();
    process.on("SIGINT", onInterrupt);
    process.on("SIGTERM", onTerminate);
    try {
      return await runCheckCli(argv.slice(1), writer, {
        cwd,
        installation: () => loadInstallation(bundleDirectory),
        environment: process.env,
        stdio: "inherit",
        terminate: interruption.signal,
        interrupted: interrupted.signal,
      });
    } finally {
      process.off("SIGINT", onInterrupt);
      process.off("SIGTERM", onTerminate);
    }
  }
  if (argv[0] === "connectors" && argv[1] === "call") {
    // An interrupt cancels the running call, which is recorded as cancelled from this observation.
    const cancellation = new AbortController();
    const cancel = (): void => cancellation.abort();
    process.once("SIGINT", cancel);
    process.once("SIGTERM", cancel);
    try {
      return await runConnectorsCallCli(
        argv.slice(2),
        {
          stdout: { write: (text) => writeStream(process.stdout, text) },
          stderr: { write: (text) => writeStream(process.stderr, text) },
        },
        {
          cwd,
          environment: process.env,
          signal: cancellation.signal,
          // Read only for --change, whose record is parsed against the modes.
          installation: () => loadInstallation(bundleDirectory),
        },
      );
    } finally {
      process.off("SIGINT", cancel);
      process.off("SIGTERM", cancel);
    }
  }
  const unavailable = (installationError: ContractParseFailed): number =>
    runCli(argv, writer, CLI_VERSION, {
      cwd,
      version: CLI_VERSION,
      environment: process.env,
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
    environment: process.env,
  };
  const prompt = createTtyPrompt(process.stdin, process.stdout);
  return runCli(
    argv,
    writer,
    CLI_VERSION,
    prompt === undefined ? environment : { ...environment, prompt },
  );
}

// The bundle is also the inspector's builder threads' one file (src/shell/inspect/builder.ts); the CLI runs on the main thread alone.
if (isMainThread) process.exitCode = await main();
