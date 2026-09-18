import { findGitRoot } from "../git.ts";
import type { CliEnvironment } from "../cli/command-environment.ts";
import { EXIT_FAILURE, EXIT_OK, type CliWriter } from "../cli/output.ts";
import { INSPECT_DEFAULT_PORT, startInspector } from "./server.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * `greenline inspect` (ADR 0028): start the inspector and stay up until
 * the process ends. Fails closed outside a Git repository or a workspace
 * with no manifest; the URL prints once the server listens.
 */
export function serveInspector(
  port: number | undefined,
  writer: CliWriter,
  env: CliEnvironment,
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
  startInspector(root, env, chosen)
    .then((handle) => {
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
