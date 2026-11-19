import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { isChangeId } from "../../core/change.ts";
import { researchTopicsOf } from "../../core/frame-map.ts";
import { recordPath } from "../../core/git-hooks.ts";
import { findGitRoot } from "../git.ts";
import { workingRecord, workspaceManifest } from "../hooks.ts";
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, type CliWriter } from "./output.ts";

/**
 * `greenline research report <file> --change <id> --topic R<n>` (J-176 S1;
 * frame's research page): the one door through which a research report
 * enters a change's folder. The report the research agent wrote under the
 * change's working folder is filed as `.greenline/ledger/<id>/frame-research-<n>.md`,
 * its first line the start's mark, for a topic the frame section proposes
 * and the owner accepted; a hand's write there is refused by the harness
 * hook and the shell guard, and the record lint refuses done while an
 * accepted topic's report is not linked from the frame section. A report
 * that stands is never written over.
 */

const USAGE = [
  "Usage: greenline research report <file> --change <id> --topic R<n>",
  "",
  "File the research agent's report for an accepted topic: the file, written",
  "under .greenline/tmp/<id>/, becomes .greenline/ledger/<id>/frame-research-<n>.md",
  "with the research start's mark on its first line. The frame section links",
  "it where it informs a question. A report that stands is never written over.",
  "",
  "Options:",
  "  --change <id>    the open change whose frame proposed the topic",
  "  --topic R<n>     the topic, as the frame section names it, its accepted line quoting the owner",
  "  -h, --help       show this help",
  "",
].join("\n");

/** A parsed invocation, or the reason it is refused. */
type Parsed =
  | { readonly kind: "help" }
  | {
      readonly kind: "file";
      readonly file: string;
      readonly change: string;
      readonly topic: string;
    }
  | { readonly kind: "refused"; readonly message: string };

function parseResearchArgs(argv: readonly string[]): Parsed {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") return { kind: "help" };
  if (argv[0] !== "report")
    return { kind: "refused", message: `the verb is report, not '${argv[0] ?? ""}'` };
  const values = new Map<string, string>();
  let file: string | undefined;
  for (let index = 1; index < argv.length; index += 1) {
    const option = argv[index] ?? "";
    if (option === "--help" || option === "-h") return { kind: "help" };
    if (!option.startsWith("--")) {
      if (file !== undefined)
        return { kind: "refused", message: `one report is filed at a time, not '${option}' too` };
      file = option;
      continue;
    }
    const value = argv[index + 1];
    if (option !== "--change" && option !== "--topic")
      return { kind: "refused", message: `unknown argument '${option}'` };
    if (value === undefined || value === "")
      return { kind: "refused", message: `${option} needs a value` };
    if (values.has(option))
      return { kind: "refused", message: `${option} is given twice; give it once` };
    values.set(option, value);
    index += 1;
  }
  const change = values.get("--change");
  const topic = values.get("--topic");
  if (file === undefined || change === undefined || topic === undefined)
    return { kind: "refused", message: "the report's file, --change and --topic are required" };
  if (!/^R[1-9]\d*$/.test(topic))
    return { kind: "refused", message: `--topic names a topic as R<n>, not '${topic}'` };
  return { kind: "file", file, change, topic };
}

/** The frame section's text of a record, or undefined where it holds none. */
function frameSection(text: string): string | undefined {
  const lines = text.split("\n");
  const at = lines.findIndex((line) => line.trimEnd() === "## frame");
  if (at === -1) return undefined;
  const after = lines.slice(at + 1);
  const next = after.findIndex((line) => line.startsWith("## "));
  return (next === -1 ? after : after.slice(0, next)).join("\n");
}

/**
 * Run `greenline research`.
 * @param argv the arguments after `research`
 * @param writer greenline's own streams: the report's path on stdout, the rest on stderr
 * @param cwd where it runs
 * @returns 0 when the report is filed, 2 for a refusal, 1 when greenline itself failed
 */
export function runResearchCli(argv: readonly string[], writer: CliWriter, cwd: string): number {
  const refuse = (message: string): number => {
    writer.stderr.write(`greenline research: ${message}\n`);
    return EXIT_USAGE;
  };
  const parsed = parseResearchArgs(argv);
  if (parsed.kind === "help") {
    writer.stdout.write(USAGE);
    return EXIT_OK;
  }
  if (parsed.kind === "refused") return refuse(parsed.message);
  const root = findGitRoot(cwd);
  if (root === undefined) return refuse("research runs inside a Git repository");
  if (workspaceManifest(root) === undefined)
    return refuse("not a greenline workspace, or its manifest does not read; run greenline init");
  const { change, topic, file } = parsed;
  if (!isChangeId(change)) return refuse(`'${change}' is no change's id`);
  if (workingRecord(root, change)?.state !== "open")
    return refuse(
      `a report is filed for an open change, and change ${change}'s record is not open`,
    );
  let record: string;
  try {
    record = readFileSync(join(root, recordPath(change)), "utf8");
  } catch {
    return refuse(`change ${change}'s record does not read`);
  }
  const proposed = researchTopicsOf(frameSection(record) ?? "").find((each) => each.id === topic);
  if (proposed === undefined)
    return refuse(
      `the frame section proposes no topic ${topic}: write it as - ${topic} [<node>] <topic>, with its source, question and what it changes, before its reading runs`,
    );
  if (proposed.accepted === null)
    return refuse(
      `the owner has not accepted ${topic}: its accepted line quotes their words once they do, and the reading runs after`,
    );
  const source = resolve(cwd, file);
  const inside = relative(root, source);
  if (inside.startsWith("..") || isAbsolute(inside))
    return refuse(`${file} lies outside the repository`);
  let text: string;
  try {
    text = readFileSync(source, "utf8");
  } catch {
    return refuse(`${file} stands nowhere or does not read`);
  }
  const number = topic.slice(1);
  const report = `.greenline/ledger/${change}/frame-research-${number}.md`;
  if (existsSync(join(root, report)))
    return refuse(`${report} already stands, and a report is never written over`);
  const mark = `<!-- generated by the research start: report ${number} -->`;
  const body = text.startsWith("<!-- generated by the research start:")
    ? text.slice(text.indexOf("\n") + 1)
    : text;
  try {
    mkdirSync(join(root, ".greenline", "ledger", change), { recursive: true });
    writeFileSync(join(root, report), `${mark}\n${body}`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    writer.stderr.write(`greenline research: ${report} could not be written: ${String(error)}\n`);
    return EXIT_FAILURE;
  }
  writer.stdout.write(`${report}\n`);
  writer.stderr.write(
    `greenline research: filed ${report} for ${topic}; link it from the frame section, [${topic}](${change}/frame-research-${number}.md), where it informs a question\n`,
  );
  return EXIT_OK;
}
