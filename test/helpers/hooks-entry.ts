/**
 * The `greenline` a fixture repository's hooks and adapters reach in tests:
 * the hook and event commands alone, run from source by node, so a real git
 * running a real hook script exercises the product's own code. The shipped
 * entry point dispatches the same two commands the same way.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseModes } from "../../src/core/modes.ts";
import { runEventCli } from "../../src/shell/cli/event.ts";
import { runHookCli } from "../../src/shell/cli/hook.ts";

const [command, ...rest] = process.argv.slice(2);
const writer = { stdout: process.stdout, stderr: process.stderr };
const stdin = (): string => {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
};
const cwd = process.cwd();
// The modes' order from the product's own definition, as the shipped entry reads it from its bundle.
const modes = (): readonly string[] | undefined => {
  const path = join(import.meta.dirname, "../../corpus/runtime/modes.json");
  const parsed = parseModes(readFileSync(path, "utf8"), path);
  return parsed._tag === "ok" ? parsed.value.modes.map((mode) => mode.name) : undefined;
};
process.exitCode =
  command === "hook"
    ? runHookCli(rest, writer, { cwd, stdin, modes })
    : command === "event"
      ? runEventCli(rest, writer, { cwd, stdin, modes })
      : 0;
