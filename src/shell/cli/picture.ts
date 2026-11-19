import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { parseJson } from "../../core/contract.ts";
import { isChangeId } from "../../core/change.ts";
import { askNotHeld } from "../../core/record-lines.ts";
import {
  briefPath,
  MANIFEST_SUFFIX,
  parseBrief,
  parseVisualManifest,
  pictureMaker,
  VISUAL_EXTENSIONS,
  type DrawingEvent,
  type PictureBrief,
  VISUAL_SCHEMA,
  VISUALS_HOME,
} from "../../core/visuals.ts";
import { headCommit } from "../code-tree.ts";
import { atomicWriteFile } from "../fs/io.ts";
import { findGitRoot } from "../git.ts";
import { workingRecord, workspaceManifest } from "../hooks.ts";
import { ownerJournal } from "../owner-words.ts";
import { absentAt } from "../visuals.ts";
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, type CliWriter } from "./output.ts";

/**
 * `greenline picture keep <file> --change <id> ...` (J-176 S1; the
 * register's row of 2026-11-05, "The keeper over the oracle", its three
 * features kept; `docs/SPEC.md` §3 and §4): the one door into a change's
 * folder of the visual home. It writes the picture and its manifest
 * together, `.greenline/visuals/<id>/<slug>.<ext>` beside
 * `<slug>.visual.json`, and every other write there is refused by the
 * harness hook and the shell guard. The manifest's words, what the picture
 * shows, the files it covers and why, are the agent's, given as options;
 * the command checks their shape, stamps the change, the commit HEAD names
 * and the date, and writes nothing on a refusal. A picture is kept only on
 * the owner's ask, whose words `--ask` quotes and, where the hooks journaled
 * the owner's messages, one of them holds; and only while the change is
 * open with the owner's yes.
 */

const USAGE = [
  "Usage: greenline picture keep <file> --change <id> --ask <the owner's words> --title <title> --form <form> --skill <skill> --summary <text> --files <path>,<path> [--slug <slug>] [--replaces <slug>]",
  "",
  "Keep a picture the owner asked for in the change's folder of the visual",
  "home: the file, an SVG drawing, an HTML page or a Markdown page drawn under",
  ".greenline/tmp/<id>/, is written to .greenline/visuals/<id>/<slug>.<ext>",
  "with its manifest beside it, together. The manifest's words are yours:",
  "its title, its form, the skill it was drawn by, a summary of what it shows",
  "and why, and the repository files it covers, each held by the commit HEAD",
  "names. --ask quotes the owner's words that asked for it. A picture that",
  "stands is never written over: keep a remake under a new slug, and name",
  "the picture it replaces with --replaces, which status names to the owner.",
  "The brief its skill wrote is read under the slug the picture is kept as;",
  "a picture kept with none is kept, and the keep says so.",
  "",
  "Options:",
  "  --change <id>       the open change the picture belongs to",
  "  --ask <words>       the owner's words that asked for the picture",
  "  --title <title>     the picture's title",
  "  --form <form>       its form, such as sequence, state, flow or box drawing",
  "  --skill <skill>     the skill it was drawn by, such as show-me or diagram-design",
  "  --summary <text>    what it shows and why, in a sentence",
  "  --files <paths>     the repository files it covers, comma-separated; a trailing / covers a folder",
  "  --slug <slug>       its name in the home; the file's name where none is given",
  "  --replaces <slug>   the kept picture of the same change this remake replaces",
  "  -h, --help          show this help",
  "",
].join("\n");

const VALUED: readonly string[] = [
  "--change",
  "--ask",
  "--title",
  "--form",
  "--skill",
  "--summary",
  "--files",
  "--slug",
  "--replaces",
];

/** The options a keep requires; `--ask` is read with the owner's journal, so its absence names what a real ask is. */
const REQUIRED: readonly string[] = [
  "--change",
  "--title",
  "--form",
  "--skill",
  "--summary",
  "--files",
];

/** A parsed invocation, or the reason it is refused. */
type Parsed =
  | { readonly kind: "help" }
  | {
      readonly kind: "keep";
      readonly file: string;
      readonly values: ReadonlyMap<string, string>;
    }
  | { readonly kind: "refused"; readonly message: string };

function parsePictureArgs(argv: readonly string[]): Parsed {
  if (argv[0] === "--help" || argv[0] === "-h" || argv.length === 0) return { kind: "help" };
  if (argv[0] !== "keep")
    return { kind: "refused", message: `the verb is keep, not '${argv[0] ?? ""}'` };
  const values = new Map<string, string>();
  let file: string | undefined;
  for (let index = 1; index < argv.length; index += 1) {
    const option = argv[index] ?? "";
    if (option === "--help" || option === "-h") return { kind: "help" };
    if (!option.startsWith("--")) {
      if (file !== undefined)
        return { kind: "refused", message: `one file is kept at a time, not '${option}' too` };
      file = option;
      continue;
    }
    const value = argv[index + 1];
    if (!VALUED.includes(option))
      return { kind: "refused", message: `unknown argument '${option}'` };
    if (value === undefined || value.trim() === "")
      return { kind: "refused", message: `${option} needs a value` };
    if (values.has(option))
      return { kind: "refused", message: `${option} is given twice; give it once` };
    values.set(option, value);
    index += 1;
  }
  if (file === undefined) return { kind: "refused", message: "name the picture's file to keep" };
  const missing = REQUIRED.filter((option) => !values.has(option));
  if (missing.length > 0)
    return {
      kind: "refused",
      message: `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required: the manifest's words are yours`,
    };
  return { kind: "keep", file, values };
}

/** What a raw log line is read for, the maker's facts (J-192 S1). */
const LOGGED = z.object({
  kind: z.string(),
  at: z.string(),
  agent: z.string().nullable().optional().catch(null),
  call: z.string().nullable().optional().catch(null),
  cwd: z.string().nullable().optional().catch(null),
  command: z.object({ text: z.string().nullable() }).nullable().optional().catch(null),
  write: z
    .object({ paths: z.array(z.string()) })
    .nullable()
    .optional()
    .catch(null),
});

/**
 * The change's logged events as the maker is derived from them: each
 * write's paths from the root, a path outside it left out.
 * @param root the repository root
 * @param change the change
 * @returns the events, oldest first; none where the log stands nowhere
 */
function drawingEvents(root: string, change: string): readonly DrawingEvent[] {
  let text: string;
  try {
    text = readFileSync(join(root, ".greenline", "tmp", change, "events.jsonl"), "utf8");
  } catch {
    return [];
  }
  return text.split("\n").flatMap((line) => {
    const read = LOGGED.safeParse(parseJson(line));
    if (!read.success) return [];
    const event = read.data;
    const base = event.cwd ?? root;
    return [
      {
        kind: event.kind,
        at: event.at,
        agent: event.agent ?? null,
        call: event.call ?? null,
        command: event.command?.text ?? null,
        written: (event.write?.paths ?? []).flatMap((path) => {
          const inside = relative(root, isAbsolute(path) ? path : resolve(base, path));
          return inside.startsWith("..") || isAbsolute(inside) ? [] : [inside.split(sep).join("/")];
        }),
      },
    ];
  });
}

/** A slug: lowercase words joined by hyphens. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Today's date as a manifest's `made` states it. */
function today(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The brief a durable picture's skill wrote before it drew (J-204 S1): the
 * file beside the picture of the same stem, `<stem>.brief.md`, else the
 * change's `.greenline/tmp/<id>/pictures/<slug>.brief.md`.
 * @param root the repository root
 * @param source the picture's file, absolute
 * @param change the change
 * @param slug the slug it is kept under
 * @returns the brief, why it does not read, or the two paths read where none stands
 */
function readBrief(
  root: string,
  source: string,
  change: string,
  slug: string,
):
  | { readonly brief: PictureBrief }
  | { readonly refused: string }
  | { readonly absent: readonly string[] } {
  const beside = join(dirname(source), `${basename(source, extname(source))}.brief.md`);
  const looked = [beside, join(root, briefPath(change, slug))];
  const shownOf = (each: string): string => relative(root, each).split(sep).join("/");
  const path = looked.find((each) => existsSync(each));
  if (path === undefined) return { absent: looked.map(shownOf) };
  const shown = shownOf(path);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    return { refused: `the brief ${shown} does not read: ${String(error)}` };
  }
  const read = parseBrief(text, shown);
  if (read._tag === "ok") return { brief: read.value };
  return {
    refused: `the brief ${shown} does not read: ${read.error.issues
      .map((issue) => `${issue.path === "" ? "the brief" : issue.path}: ${issue.message}`)
      .join(
        "; ",
      )}; write each field on its own line as '- <field>: <value>': question, form, nodes (a number), finish (text, branded SVG or interactive), palette and reader`,
  };
}

/** What the verb needs beyond its arguments. */
export interface PictureEnvironment {
  readonly cwd: string;
  /** The clock a test may fix. */
  readonly now?: () => Date;
}

/**
 * Run `greenline picture`.
 * @param argv the arguments after `picture`
 * @param writer greenline's own streams: the visual's path on stdout, the rest on stderr
 * @param env where it runs
 * @returns 0 when the picture is kept, 2 for a refusal, 1 when greenline itself failed
 */
export function runPictureCli(
  argv: readonly string[],
  writer: CliWriter,
  env: PictureEnvironment,
): number {
  const refuse = (message: string): number => {
    writer.stderr.write(`greenline picture: ${message}\n`);
    return EXIT_USAGE;
  };
  const parsed = parsePictureArgs(argv);
  if (parsed.kind === "help") {
    writer.stdout.write(USAGE);
    return EXIT_OK;
  }
  if (parsed.kind === "refused") return refuse(parsed.message);
  const value = (option: string): string => parsed.values.get(option) ?? "";
  const root = findGitRoot(env.cwd);
  if (root === undefined) return refuse("picture runs inside a Git repository");
  if (workspaceManifest(root) === undefined)
    return refuse("not a greenline workspace, or its manifest does not read; run greenline init");
  const change = value("--change");
  if (!isChangeId(change)) return refuse(`'${change}' is no change's id`);
  const record = workingRecord(root, change);
  if (record?.state !== "open" || record.choice === undefined)
    return refuse(
      `nothing is kept in the visual home before the owner's yes: change ${change}'s record ${record === undefined ? "stands nowhere" : record.state !== "open" ? `reads ${record.state ?? "no state"}` : "carries no choice line"}; a picture belongs to an open change the owner said yes to`,
    );
  // The ask is the owner's whole ask for a picture, read in their journal as owner-yes reads it (J-192 S1).
  const unasked = askNotHeld(parsed.values.get("--ask"), ownerJournal(root));
  if (unasked !== undefined) return refuse(`a picture is kept only on the owner's ask: ${unasked}`);
  const source = resolve(env.cwd, parsed.file);
  const inside = relative(root, source);
  if (inside.startsWith("..") || isAbsolute(inside))
    return refuse(`${parsed.file} lies outside the repository`);
  if (!existsSync(source)) return refuse(`${parsed.file} stands nowhere`);
  const extension = extname(source).slice(1).toLowerCase();
  if (!VISUAL_EXTENSIONS.some((each) => each === extension))
    return refuse(
      `a kept picture is an SVG drawing, an HTML page or a Markdown page, not a .${extension} file`,
    );
  const slug = parsed.values.get("--slug") ?? basename(source, extname(source));
  if (!SLUG.test(slug))
    return refuse(`'${slug}' is no slug: lowercase words joined by hyphens; give one with --slug`);
  const folder = `${VISUALS_HOME}/${change}`;
  const picture = `${folder}/${slug}.${extension}`;
  const manifestPath = `${folder}/${slug}${MANIFEST_SUFFIX}`;
  if (existsSync(join(root, picture)) || existsSync(join(root, manifestPath)))
    return refuse(
      `${picture} already stands, and a kept picture is never written over: keep the remake under a new slug, with --replaces ${slug}`,
    );
  // The kept picture a remake replaces, which stands in the same change's folder (J-227 S1).
  const replaced = parsed.values.get("--replaces");
  if (replaced !== undefined && !SLUG.test(replaced))
    return refuse(
      `'${replaced}' is no slug: --replaces names the slug of a kept picture in the same change's folder`,
    );
  if (replaced !== undefined && !existsSync(join(root, `${folder}/${replaced}${MANIFEST_SUFFIX}`)))
    return refuse(
      `--replaces names ${replaced}, and no picture of that slug stands in ${folder}/: name the slug of the kept picture this one replaces, in the same change's folder`,
    );
  // The brief its skill wrote before it drew, beside the file or under the change's pictures, read into the manifest (J-204 S1).
  const brief = readBrief(root, source, change, slug);
  if ("refused" in brief) return refuse(brief.refused);
  const head = headCommit(root);
  if (head.kind !== "commit")
    return refuse("the repository has no commit yet, which a picture's manifest names");
  const files = value("--files")
    .split(",")
    .map((path) => path.trim())
    .filter((path) => path !== "");
  const manifest = {
    schema: VISUAL_SCHEMA,
    title: value("--title"),
    form: value("--form"),
    skill: value("--skill"),
    change,
    commit: head.id,
    files,
    made: today(env.now?.() ?? new Date()),
    // Who drew it, from the agent facts the hooks logged, never the agent's word (J-192 S1).
    madeBy: pictureMaker(
      inside.split(sep).join("/"),
      statSync(source).mtimeMs,
      drawingEvents(root, change),
    ),
    summary: value("--summary"),
    // The owner's ask is the picture's reason, recorded beside its summary.
    ask: value("--ask"),
    // The picture a remake replaces, by its id, which JSON leaves out where none is named (J-227 S1).
    replaces: replaced === undefined ? undefined : `${change}/${replaced}`,
    // The brief its skill wrote, which JSON leaves out where none stands (J-204 S1).
    brief: "brief" in brief ? brief.brief : undefined,
  };
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  const read = parseVisualManifest(text, manifestPath);
  if (read._tag === "err")
    return refuse(
      `the manifest does not read: ${read.error.issues
        .map((issue) => (issue.path === "" ? issue.message : `${issue.path}: ${issue.message}`))
        .join("; ")}`,
    );
  const absent = absentAt(root, head.id, files);
  if (absent !== undefined && absent.length > 0)
    return refuse(
      `the picture covers ${absent.join(", ")}, which the commit HEAD names does not hold: name the files that stand, or keep it once they are committed`,
    );
  let bytes: string;
  try {
    bytes = readFileSync(source, "utf8");
  } catch (error) {
    return refuse(`${parsed.file} does not read: ${String(error)}`);
  }
  const wrote = atomicWriteFile(join(root, picture), bytes);
  if (wrote._tag === "err") {
    writer.stderr.write(
      `greenline picture: ${picture} could not be written: ${wrote.error.message}\n`,
    );
    return EXIT_FAILURE;
  }
  // The manifest stands beside the picture, or neither stands.
  const described = atomicWriteFile(join(root, manifestPath), text);
  if (described._tag === "err") {
    rmSync(join(root, picture), { force: true });
    writer.stderr.write(
      `greenline picture: ${manifestPath} could not be written, so ${picture} was taken out again: ${described.error.message}\n`,
    );
    return EXIT_FAILURE;
  }
  writer.stdout.write(`${picture}\n`);
  writer.stderr.write(
    `greenline picture: kept ${change}/${slug} with its manifest; greenline view visual ${change} ${slug} prints its address\n`,
  );
  // A keep with no brief keeps the picture and says so, naming the paths it read (J-227 S1, j201t-linear-visuals finding 6).
  if ("absent" in brief)
    writer.stderr.write(
      `greenline picture: kept ${change}/${slug} with no brief: none stood at ${brief.absent.join(" or ")}, the brief is read under the slug a picture is kept as, and greenline status names it as GL0606\n`,
    );
  return EXIT_OK;
}
