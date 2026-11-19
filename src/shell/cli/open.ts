import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Result } from "../../commons/result.ts";
import { isChangeId, renderRecordSkeleton } from "../../core/change.ts";
import type { ContractParseFailed } from "../../core/contract.ts";
import { recordPath } from "../../core/git-hooks.ts";
import type { Installation } from "../../core/installation.ts";
import { joined, owedLines } from "../../core/record-lines.ts";
import { findGitRoot } from "../git.ts";
import { workspaceManifest } from "../hooks.ts";
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, type CliWriter } from "./output.ts";

/**
 * `greenline open --change <id> --mode <mode>` (J-176 S1; `docs/SPEC.md`
 * section 4; the ledger guide, "The record"): write a change's record from
 * its mode's skeleton, every line the mode owes named and a placeholder in
 * each, so the lines are seen rather than remembered. The command writes no
 * line of the agent's: each placeholder is the agent's to replace in its own
 * words, status names the lines the record still lacks while the change is
 * open, and git's hooks refuse done with a line missing or a placeholder in
 * place. It never writes over a record that stands; a refusal writes nothing
 * and exits with the usage code.
 */

/** What the verb needs beyond its arguments. */
export interface OpenEnvironment {
  readonly cwd: string;
  /** The installation, read only once the arguments are valid, so help needs none. */
  readonly installation: () => Result<Installation, ContractParseFailed>;
}

const USAGE = [
  "Usage: greenline open --change <id> --mode <mode>",
  "",
  "Write the change's record, .greenline/ledger/<id>.md, from its mode's",
  "skeleton: the front matter with every line the mode owes named and a",
  "placeholder in each, and one section per step of the line. Replace each",
  "placeholder with your own words for its meaning; greenline status names",
  "the lines the record still lacks, and git's hooks refuse done while one",
  "is missing or a placeholder stands. A record that stands is never",
  "written over.",
  "",
  "Options:",
  "  --change <id>   the change's id, a date and a slug, such as 2026-11-06-retry-deadline",
  "  --mode <mode>   the mode the change runs under",
  "  -h, --help      show this help",
  "",
].join("\n");

/** A parsed invocation, or the reason it is refused. */
type Parsed =
  | { readonly kind: "help" }
  | { readonly kind: "open"; readonly change: string; readonly mode: string }
  | { readonly kind: "refused"; readonly message: string };

const VALUED: readonly string[] = ["--change", "--mode"];

function parseOpenArgs(argv: readonly string[]): Parsed {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index] ?? "";
    if (option === "--help" || option === "-h") return { kind: "help" };
    const value = argv[index + 1];
    if (!VALUED.includes(option))
      return { kind: "refused", message: `unknown argument '${option}'` };
    if (value === undefined || value === "")
      return { kind: "refused", message: `${option} needs a value` };
    if (values.has(option))
      return { kind: "refused", message: `${option} is given twice; give it once` };
    values.set(option, value);
    index += 1;
  }
  const change = values.get("--change");
  const mode = values.get("--mode");
  if (change === undefined || mode === undefined)
    return { kind: "refused", message: "--change and --mode are required" };
  if (!isChangeId(change))
    return {
      kind: "refused",
      message: `'${change}' is no change's id: a real date and a slug, such as 2026-11-06-retry-deadline`,
    };
  return { kind: "open", change, mode };
}

/**
 * Run `greenline open`.
 * @param argv the arguments after `open`
 * @param writer greenline's own streams: the record's path on stdout, the rest on stderr
 * @param env where it runs and what it reads
 * @returns 0 when the record is written, 2 for a refusal, 1 when greenline itself failed
 */
export function runOpenCli(
  argv: readonly string[],
  writer: CliWriter,
  env: OpenEnvironment,
): number {
  const refuse = (message: string): number => {
    writer.stderr.write(`greenline open: ${message}\n`);
    return EXIT_USAGE;
  };
  const parsed = parseOpenArgs(argv);
  if (parsed.kind === "help") {
    writer.stdout.write(USAGE);
    return EXIT_OK;
  }
  if (parsed.kind === "refused") return refuse(parsed.message);
  const root = findGitRoot(env.cwd);
  if (root === undefined) return refuse("open runs inside a Git repository");
  const manifest = workspaceManifest(root);
  if (manifest === undefined)
    return refuse("not a greenline workspace, or its manifest does not read; run greenline init");
  const installation = env.installation();
  if (installation._tag === "err") {
    writer.stderr.write(
      `greenline open: the installation is unavailable, so the modes cannot be read (GL0140): ${installation.error.issues
        .map((issue) => issue.message)
        .join("; ")}\n`,
    );
    return EXIT_FAILURE;
  }
  const definition = installation.value.modes;
  const mode = definition.modes.find((entry) => entry.name === parsed.mode);
  if (mode === undefined)
    return refuse(
      `'${parsed.mode}' is no mode; the modes are ${definition.modes.map((entry) => entry.name).join(", ")}`,
    );
  const path = recordPath(parsed.change);
  if (existsSync(join(root, path)))
    return refuse(
      `${path} already stands, and a record is never written over: resume the change from it, or choose another id`,
    );
  const text = renderRecordSkeleton(
    definition,
    mode,
    manifest.interface === undefined ? "none" : "named",
  );
  try {
    mkdirSync(join(root, ".greenline", "ledger"), { recursive: true });
    // `wx`: the write fails rather than replace a record that appeared since the check.
    writeFileSync(join(root, path), text, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    writer.stderr.write(`greenline open: ${path} could not be written: ${String(error)}\n`);
    return EXIT_FAILURE;
  }
  const owed = owedLines(definition, mode, undefined);
  writer.stdout.write(`${path}\n`);
  writer.stderr.write(
    `greenline open: wrote ${path} from the ${mode.name} skeleton; replace each placeholder in your own words: ${joined(owed.open)} now, and the yes where the owner accepted your proposal; ${joined(owed.close)} at the close\n`,
  );
  return EXIT_OK;
}
