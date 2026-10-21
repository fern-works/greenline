import { spawn, type StdioOptions } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, join, resolve as fromRoot } from "node:path";
import type { ConnectorInvocation } from "../core/connectors/registry.ts";
import type { CheckOutcome } from "../core/facts.ts";

/**
 * The one place the product starts a program that is not git, with two
 * runners that never share a trust posture.
 *
 * The connector's runner executes the registry's bounded invocation policy:
 * one child process, started without a shell from an executable greenline
 * resolved itself on the absolute `PATH` entries alone, with literal
 * arguments, a capped stdout and one deadline. It reports what it observed;
 * it never reads the child's environment for a credential and never retries.
 *
 * The check runner runs a repository's own command for `greenline check`:
 * literal arguments, no shell, at the repository root, its output passed
 * straight to the streams it is given. It captures nothing, so it has no
 * output to store.
 */

/** What one process run came to, as the parent observed it. */
export type ProcessOutcome =
  | {
      readonly kind: "exited";
      readonly code: number;
      /** The whole stdout, or null when it was not UTF-8. */
      readonly stdout: string | null;
    }
  | { readonly kind: "signalled"; readonly signal: string }
  | { readonly kind: "overflow" }
  | { readonly kind: "deadline" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "missing" }
  | { readonly kind: "failed"; readonly message: string };

/** The parent's side of a run: the environment passed on unread, where it runs, and the cancel signal. */
export interface ProcessContext {
  /**
   * Passed to the child as it is, the caller's key among it, less greenline's
   * own `GREENLINE_` settings and credentials; the executor reads the values
   * of `PATH` and `PATHEXT` alone.
   */
  readonly environment: NodeJS.ProcessEnv;
  readonly cwd: string;
  readonly signal?: AbortSignal | undefined;
}

/** Whether a path names a file this process may execute. */
function runnable(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    if (process.platform !== "win32") accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The file a bare command name runs, found on the absolute entries of
 * `PATH` alone. A relative entry, and the current directory the platform
 * might otherwise search first, is never consulted, so a repository's own
 * files cannot stand in for the command. An absolute entry is searched like
 * any other, the one a package runner adds for a repository's installed
 * dependencies among them; naming the executable's absolute path when
 * enabling pins it.
 */
function onPath(command: string, environment: NodeJS.ProcessEnv): string | undefined {
  return inEntries(
    command,
    (environment["PATH"] ?? "").split(delimiter).filter((entry) => isAbsolute(entry)),
    environment,
  );
}

/** The first runnable file a bare command names in these directories, with the platform's extensions. */
function inEntries(
  command: string,
  entries: readonly string[],
  environment: NodeJS.ProcessEnv,
): string | undefined {
  const extensions =
    process.platform === "win32"
      ? (environment["PATHEXT"] ?? ".EXE").split(";").filter((extension) => extension !== "")
      : [""];
  for (const entry of entries)
    for (const extension of extensions) {
      const candidate = join(entry, command + extension);
      if (runnable(candidate)) return candidate;
    }
  return undefined;
}

/** A package runner's bin folder for its own run, `node_modules/.bin`, the npx and pnpm dlx caches among them. */
const RUNNER_BIN = /[\\/]node_modules[\\/]\.bin[\\/]?$/;

/**
 * Whether a bare command is found where git's hooks look for it: on an
 * absolute `PATH` entry that is no package runner's bin folder, since a
 * runner such as npx puts its folder on the `PATH` of its own run alone, and
 * a hook git starts runs under the shell's.
 * @param command the bare command, such as `greenline`
 * @param environment the environment greenline runs with
 * @returns true when a runnable file of that name stands on such an entry
 */
export function onLastingPath(command: string, environment: NodeJS.ProcessEnv): boolean {
  const entries = (environment["PATH"] ?? "")
    .split(delimiter)
    .filter((entry) => isAbsolute(entry) && !RUNNER_BIN.test(entry));
  return inEntries(command, entries, environment) !== undefined;
}

/**
 * The file an executable names, as a run would start it: an absolute path
 * when it names a runnable file, a bare command found on the absolute
 * `PATH` entries, or undefined when nothing would run. It reads the
 * filesystem and `PATH` alone and starts nothing, so a diagnosis can ask
 * the same question a call answers.
 */
export function resolveConnectorExecutable(
  executable: string,
  environment: NodeJS.ProcessEnv,
): string | undefined {
  const file = isAbsolute(executable) ? executable : onPath(executable, environment);
  return file !== undefined && runnable(file) ? file : undefined;
}

/** Run one planned invocation to its end, its cap or its deadline. */
export function runConnectorProcess(
  invocation: ConnectorInvocation,
  context: ProcessContext,
): Promise<ProcessOutcome> {
  if (context.signal?.aborted === true) return Promise.resolve({ kind: "cancelled" });
  const file = resolveConnectorExecutable(invocation.executable, context.environment);
  if (file === undefined) return Promise.resolve({ kind: "missing" });
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    // greenline's own settings and credentials never reach another product's process.
    const environment = Object.fromEntries(
      Object.entries(context.environment).filter(
        // Windows names are case-insensitive, so a variable in any case is greenline's.
        ([name]) => !name.toUpperCase().startsWith("GREENLINE_"),
      ),
    );
    try {
      child = spawn(file, [...invocation.args], {
        shell: invocation.shell,
        env: environment,
        cwd: context.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      resolve({ kind: "failed", message: String(error) });
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let ended: "overflow" | "deadline" | "cancelled" | undefined;
    const stop = (reason: "overflow" | "deadline" | "cancelled"): void => {
      if (ended !== undefined) return;
      ended = reason;
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => stop("deadline"), invocation.deadlineMs);
    const cancel = (): void => stop("cancelled");
    context.signal?.addEventListener("abort", cancel, { once: true });
    child.stdout?.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > invocation.stdoutLimitBytes) stop("overflow");
      else chunks.push(chunk);
    });
    // Diagnostics on stderr are garden's, for its own person; the parent keeps none of them.
    child.stderr?.resume();
    child.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      context.signal?.removeEventListener("abort", cancel);
      resolve(
        error.code === "ENOENT" || error.code === "EACCES"
          ? { kind: "missing" }
          : { kind: "failed", message: error.message },
      );
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      context.signal?.removeEventListener("abort", cancel);
      if (ended !== undefined) return resolve({ kind: ended });
      if (signal !== null) return resolve({ kind: "signalled", signal });
      let stdout: string | null;
      try {
        stdout = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
      } catch {
        stdout = null;
      }
      resolve({ kind: "exited", code: code ?? -1, stdout });
    });
  });
}

/**
 * The file a check's command names, before anything runs: an absolute path
 * as given; a path with a separator from the directory the command runs in,
 * the repository root or a declared check's directory; a bare name on the
 * `PATH` entries, a relative entry such as `node_modules/.bin` taken from
 * that directory and an empty entry skipped. Undefined when nothing runnable
 * is there.
 * @param command the command's first argument, as given
 * @param root the directory the command runs in
 * @param environment the environment the command will run with
 * @returns the runnable file, or undefined
 */
export function resolveCheckExecutable(
  command: string,
  root: string,
  environment: NodeJS.ProcessEnv,
): string | undefined {
  if (isAbsolute(command)) return runnable(command) ? command : undefined;
  if (/[\\/]/.test(command)) {
    const file = fromRoot(root, command);
    return runnable(file) ? file : undefined;
  }
  const entries = (environment["PATH"] ?? "")
    .split(delimiter)
    .filter((entry) => entry !== "")
    .map((entry) => fromRoot(root, entry));
  return inEntries(command, entries, environment);
}

/** Where a check's command runs and where its output goes. */
export interface CheckProcessContext {
  readonly cwd: string;
  /** Passed to the command as it is. */
  readonly environment: NodeJS.ProcessEnv;
  /** The command's three streams: `inherit` passes them straight to greenline's own, as the CLI does. */
  readonly stdio: StdioOptions;
  /** Aborting it sends the command SIGTERM, as a supervisor's SIGTERM to greenline asks. */
  readonly terminate?: AbortSignal | undefined;
}

/**
 * Run a check's command to its end: literal arguments, no shell, its
 * output wherever `stdio` sends it and never read here. Nothing the
 * command prints is part of what it returns.
 * @param file the resolved executable
 * @param args the arguments after the command, as given
 * @param context where it runs and where its output goes
 * @returns how it ended
 */
export function runCheckProcess(
  file: string,
  args: readonly string[],
  context: CheckProcessContext,
): Promise<CheckOutcome> {
  return new Promise((settle) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(file, [...args], {
        shell: false,
        env: context.environment,
        cwd: context.cwd,
        stdio: context.stdio,
        windowsHide: true,
      });
    } catch (error) {
      settle({ kind: "unstarted", message: String(error) });
      return;
    }
    const forward = (): void => {
      child.kill("SIGTERM");
    };
    // A termination that came while the command was starting is passed on at once.
    if (context.terminate?.aborted === true) forward();
    else context.terminate?.addEventListener("abort", forward, { once: true });
    child.on("error", (error) => {
      // With no process id the command never started; with one, the error is a
      // signal greenline could not send, and the command's own end is still to come.
      if (child.pid !== undefined) return;
      context.terminate?.removeEventListener("abort", forward);
      settle({ kind: "unstarted", message: error.message });
    });
    child.once("close", (code, signal) => {
      context.terminate?.removeEventListener("abort", forward);
      settle(
        signal !== null ? { kind: "signalled", signal } : { kind: "exited", code: code ?? -1 },
      );
    });
  });
}
