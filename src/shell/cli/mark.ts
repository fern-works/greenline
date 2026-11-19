import { isOnList } from "../../core/interface-facets.ts";
import { MARK_INTENTS, type Mark, type MarkClosure, type MarkIntent } from "../../core/marks.ts";
import { findGitRoot } from "../git.ts";
import {
  addMark,
  closeMark,
  markStale,
  openMarks,
  proposeMark,
  readCapture,
  readMarksFiles,
  type MarkTarget,
  type MarkWritten,
} from "../marks.ts";
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, type CliWriter } from "./output.ts";

/**
 * `greenline mark` (J-124 S2; design's marks page): the marks on captures,
 * listed, added from the owner's words, proposed closed with the evidence,
 * and closed on the owner's word. Every write is one appended line under the
 * writer lock, in the folder of the change open on the mark's address or
 * under the interface ledger home. A closure is the owner's act: `close`
 * refuses without the owner's words to quote, and the viewer's own close
 * records the owner's click.
 */

const USAGE = [
  "Usage: greenline mark list [--all] [--json]",
  "       greenline mark add --capture <id> --width <n> (--selector <css> | --region <x,y x,y ...>)",
  "                          --note <text> --intent fix|question|options|idea --words <owner's words>",
  "       greenline mark propose <mark> [--as addressed|declined] [--capture <after>] [--diff <ref>] --note <text>",
  "       greenline mark close <mark> --as addressed|declined --words <owner's words>",
  "",
  "The marks the owner left on captures, each on one element or a region drawn,",
  "with a note and an intent. list prints the open marks, stale ones named (--all",
  "prints every mark). add records a mark the owner said in words, quoting them.",
  "propose records the closure you propose with its evidence, the capture after",
  "and the commit; the mark stays open. close records the owner's closure and",
  "refuses without the owner's words; the owner may close it in the viewer too.",
  "",
].join("\n");

/** The options that take a value. */
const VALUED = new Set([
  "--capture",
  "--width",
  "--selector",
  "--region",
  "--note",
  "--intent",
  "--words",
  "--as",
  "--diff",
]);

/** The arguments read: the verb, its one positional and the options. */
interface Parsed {
  readonly verb: string;
  readonly positional: string | undefined;
  readonly values: ReadonlyMap<string, string>;
  readonly flags: ReadonlySet<string>;
}

/** The arguments read, or the usage error. */
type ParseResult =
  | { readonly kind: "read"; readonly parsed: Parsed }
  | { readonly kind: "refused"; readonly message: string };

function parse(argv: readonly string[]): ParseResult {
  const [verb = "", ...rest] = argv;
  const values = new Map<string, string>();
  const flags = new Set<string>();
  let positional: string | undefined;
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index] ?? "";
    if (arg === "--json" || arg === "--all") flags.add(arg);
    else if (VALUED.has(arg)) {
      const value = rest[index + 1];
      if (value === undefined || value === "")
        return { kind: "refused", message: `${arg} needs a value` };
      values.set(arg, value);
      index += 1;
    } else if (!arg.startsWith("--") && positional === undefined) positional = arg;
    else return { kind: "refused", message: `unknown argument '${arg}'` };
  }
  return { kind: "read", parsed: { verb, positional, values, flags } };
}

/** A mark in one line: its id, state, address and width, its intent, what it names and its note. */
function markText(mark: Mark, stale: boolean): string {
  const target =
    mark.element === null
      ? `a region over ${mark.region?.elements.length === 0 ? "no element" : (mark.region?.elements.join(", ") ?? "")}`
      : `${mark.element.role ?? mark.element.tag} "${mark.element.text}" ${mark.element.selector}${mark.element.source === null ? "" : ` (${mark.element.source.file}${mark.element.source.line === null ? "" : `:${String(mark.element.source.line)}`})`}`;
  const proposal =
    mark.proposed === null
      ? ""
      : `; proposed ${mark.proposed.as}${mark.proposed.capture === null ? "" : ` with ${mark.proposed.capture}`}, waiting on the owner`;
  return `${mark.id} ${mark.state} ${mark.address} at ${String(mark.width)}, ${mark.intent}: ${target}: "${mark.note}"${stale ? "; stale, its capture's files changed since" : ""}${proposal}`;
}

/** The region's points from `x,y x,y ...`, or undefined. */
function pointsOf(text: string): readonly (readonly [number, number])[] | undefined {
  const points = text
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number));
  return points.every((pair) => pair.length === 2 && pair.every(Number.isFinite))
    ? points.map((pair) => [pair[0] ?? 0, pair[1] ?? 0] as const)
    : undefined;
}

function closureOf(value: string | undefined, fallback?: MarkClosure): MarkClosure | undefined {
  if (value === undefined) return fallback;
  return value === "addressed" || value === "declined" ? value : undefined;
}

/** Print a write's answer. */
function answer(writer: CliWriter, written: MarkWritten, json: boolean): number {
  if (written.kind === "refused") {
    writer.stderr.write(`greenline mark: ${written.error}\n`);
    return EXIT_FAILURE;
  }
  writer.stdout.write(
    json
      ? `${JSON.stringify({ mark: written.mark, file: written.file }, null, 2)}\n`
      : `${markText(written.mark, false)}\n  in ${written.file}\n`,
  );
  return EXIT_OK;
}

/**
 * Run `greenline mark`.
 * @param argv the arguments after `mark`
 * @param writer greenline's streams
 * @param cwd where it runs
 * @param now the time a write records
 * @returns 0 done, 1 refused by the marks, 2 a usage error
 */
export function runMarkCli(
  argv: readonly string[],
  writer: CliWriter,
  cwd: string,
  now: () => Date = () => new Date(),
): number {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    writer.stdout.write(USAGE);
    return argv.length === 0 ? EXIT_USAGE : EXIT_OK;
  }
  const read = parse(argv);
  const usage = (message: string): number => {
    writer.stderr.write(`greenline mark: ${message}\n`);
    return EXIT_USAGE;
  };
  if (read.kind === "refused") return usage(read.message);
  const { parsed } = read;
  const root = findGitRoot(cwd) ?? cwd;
  const { values, flags, positional } = parsed;
  const json = flags.has("--json");
  switch (parsed.verb) {
    case "list": {
      const files = readMarksFiles(root);
      const open = openMarks(root, files);
      const shown = flags.has("--all")
        ? files.flatMap((file) =>
            file.marks.map((mark) => ({
              mark,
              file: file.path,
              stale:
                mark.state === "open" &&
                markStale(root, mark, readCapture(root, mark.capture.id)?.manifest),
            })),
          )
        : files.flatMap((file) =>
            open
              .filter((entry) => file.marks.includes(entry.mark))
              .map((entry) => ({ ...entry, file: file.path })),
          );
      for (const file of files)
        for (const line of file.unreadable)
          writer.stderr.write(
            `greenline mark: ${file.path}:${String(line.line)} does not read: ${line.why}\n`,
          );
      if (json) {
        writer.stdout.write(`${JSON.stringify({ marks: shown }, null, 2)}\n`);
        return EXIT_OK;
      }
      writer.stdout.write(
        shown.length === 0
          ? `${flags.has("--all") ? "No mark" : "No open mark"} on any capture.\n`
          : `${shown.map((entry) => `${markText(entry.mark, entry.stale)}\n  in ${entry.file}`).join("\n")}\n`,
      );
      return EXIT_OK;
    }
    case "add": {
      const capture = values.get("--capture");
      const width = Number(values.get("--width"));
      const note = values.get("--note");
      const intent = values.get("--intent");
      const words = values.get("--words");
      const selector = values.get("--selector");
      const region = values.get("--region");
      if (capture === undefined || note === undefined || intent === undefined)
        return usage("add takes --capture, --width, --note and --intent");
      if (!Number.isInteger(width) || width <= 0) return usage("--width is a captured width");
      if (!isOnList(MARK_INTENTS, intent))
        return usage(`--intent is one of ${MARK_INTENTS.join(", ")}`);
      if (words === undefined)
        return usage(
          "add records a mark the owner said in words: quote them with --words; the owner marks in the viewer otherwise",
        );
      if ((selector === undefined) === (region === undefined))
        return usage("add names one element with --selector or one region with --region");
      let target: MarkTarget;
      if (selector !== undefined) target = { kind: "element", selector };
      else {
        const points = pointsOf(region ?? "");
        if (points === undefined || points.length < 2)
          return usage("--region is two points or more, as x,y x,y");
        target = { kind: "region", path: points };
      }
      const markIntent: MarkIntent = intent;
      return answer(
        writer,
        addMark(
          root,
          { capture, width, target, note, intent: markIntent, by: "agent", words },
          now(),
        ),
        json,
      );
    }
    case "propose": {
      const note = values.get("--note");
      const as = closureOf(values.get("--as"), "addressed");
      if (positional === undefined || note === undefined)
        return usage("propose takes the mark's id and --note");
      if (as === undefined) return usage("--as is addressed or declined");
      return answer(
        writer,
        proposeMark(
          root,
          positional,
          {
            as,
            capture: values.get("--capture") ?? null,
            diff: values.get("--diff") ?? null,
            note,
          },
          now(),
        ),
        json,
      );
    }
    case "close": {
      const as = closureOf(values.get("--as"));
      const words = values.get("--words");
      if (positional === undefined || as === undefined)
        return usage("close takes the mark's id and --as addressed or declined");
      if (words === undefined) {
        writer.stderr.write(
          "greenline mark: a mark closes only on the owner's act: quote the owner's words with --words, or let the owner close it in the viewer\n",
        );
        return EXIT_FAILURE;
      }
      return answer(writer, closeMark(root, positional, as, { via: "words", words }, now()), json);
    }
    default:
      return usage(`'${parsed.verb}' is none of list, add, propose and close`);
  }
}
