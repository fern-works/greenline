import { spawn } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";
import type { ConnectorInvocation } from "../../core/connectors/registry.ts";

/**
 * The executor of the registry's bounded invocation policy: one child
 * process, started without a shell from an executable greenline resolved
 * itself, with literal arguments, a capped stdout and one deadline. It
 * reports what it observed; it never reads the child's environment for a
 * credential and never retries.
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
  const entries = (environment["PATH"] ?? "").split(delimiter).filter((entry) => isAbsolute(entry));
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
