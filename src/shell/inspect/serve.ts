import { findGitRoot } from "../git.ts";
import type { CliEnvironment } from "../cli/command-environment.ts";
import { EXIT_FAILURE, EXIT_OK, type CliWriter } from "../cli/output.ts";
import { removeAddressFile, writeAddressFile } from "./address-file.ts";
import { INSPECT_DEFAULT_PORT, startInspector, type InspectorHandle } from "./server.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Keep the address file while the viewer serves (J-142 S1): written once it
 * listens, removed when the process stops on an interrupt, a terminate or a
 * hang-up, or exits any other way.
 * @param root the repository root
 * @param handle the serving viewer
 */
function announce(root: string, handle: InspectorHandle): void {
  writeAddressFile(root, handle.port);
  // The stop leaves the server, its builders and its watcher to the exit (J-158 S2): closing the
  // file watcher blocks this thread itself while the system's file-event service is slow, so no
  // timer beside that close could end it; the process is going away, so nothing is lost.
  const stop = (): void => {
    removeAddressFile(root);
    process.exit(EXIT_OK);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  process.once("SIGHUP", stop);
  process.once("exit", () => removeAddressFile(root));
}

/**
 * `greenline inspect` (ADR 0028): start the inspector and stay up until
 * the process ends. Fails closed outside a Git repository or a workspace
 * with no manifest; the URL prints once the server listens, and the
 * address file, `.greenline/tmp/inspect.json`, stands while it serves.
 * With `--timing` each document read prints a line: its address, how long
 * it took, and whether the cache answered it or how long its build took.
 */
export function serveInspector(
  port: number | undefined,
  writer: CliWriter,
  env: CliEnvironment,
  timing = false,
): number {
  const root = findGitRoot(env.cwd);
  if (root === undefined) {
    writer.stderr.write("greenline inspect: not inside a Git repository\n");
    return EXIT_FAILURE;
  }
  if (!existsSync(join(root, ".greenline", "manifest.json"))) {
    writer.stderr.write(
      "greenline inspect: not a greenline workspace; run 'greenline init' first\n",
    );
    return EXIT_FAILURE;
  }
  const chosen = port ?? INSPECT_DEFAULT_PORT;
  if (!Number.isInteger(chosen) || chosen < 0 || chosen > 65535) {
    writer.stderr.write(`greenline inspect: '${String(port)}' is not a port\n`);
    return EXIT_FAILURE;
  }
  // With --timing each document read prints its time and whether the cache answered it.
  const options = timing
    ? {
        builders: "threads" as const,
        watch: true,
        timing: (line: string): void => void writer.stdout.write(`greenline inspect: ${line}\n`),
      }
    : { builders: "threads" as const, watch: true };
  startInspector(root, env, chosen, undefined, options)
    .then((handle) => {
      announce(root, handle);
      writer.stdout.write(
        `greenline inspect: ${handle.url} (offline, localhost only; ctrl-c stops it)\n`,
      );
    })
    .catch((error: Error) => {
      writer.stderr.write(
        `greenline inspect: could not listen on port ${chosen}: ${error.message}\n`,
      );
      process.exitCode = EXIT_FAILURE;
    });
  return EXIT_OK;
}
