/**
 * The `greenline` a test starts as its own process for the inspector:
 * `inspect` and `view`, run from source by node over the fixture
 * installation, so the address file is written and removed by the product's
 * own command, and a test stops it with a real signal. The shipped entry
 * point dispatches the same two commands the same way.
 */
import { runCli } from "../../src/shell/cli/runner.ts";
import { detachedStarter, runViewCli } from "../../src/shell/inspect/view.ts";
import { fixtureInstallation } from "../fixtures/corpus.ts";

const [command, ...rest] = process.argv.slice(2);
const writer = {
  stdout: { write: (text: string): void => void process.stdout.write(text) },
  stderr: { write: (text: string): void => void process.stderr.write(text) },
};
const cwd = process.cwd();
if (command === "view")
  process.exitCode = await runViewCli(rest, writer, {
    cwd,
    start: detachedStarter(import.meta.filename),
  });
else
  process.exitCode = runCli([command ?? "", ...rest], writer, "0.1.0", {
    cwd,
    version: "0.1.0",
    installation: fixtureInstallation(),
  });
