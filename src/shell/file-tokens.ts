import { closeSync, openSync, readSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  DEFAULT_FILE_TOKENS,
  exemptionOf,
  fileTokensReport,
  looksBinary,
  markedGenerated,
  tokensOf,
  type FileReading,
} from "../core/file-tokens.ts";
import { readGit } from "./code-tree.ts";
import { workspaceManifest } from "./hooks.ts";
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, type CliWriter } from "./cli/output.ts";

/**
 * `greenline check files [--max-tokens <n>] [<path>...]` on the disk (J-114
 * S4; `src/core/file-tokens.ts`): the files named, or the staged files, or
 * where none is staged the files the working tree changed or added, each
 * read for its size and its first bytes, an exempt one left out, and every
 * authored file over the cap refused with how to split it. Every git
 * command here only reads.
 */

/** How many of a file's first bytes are read for a binary's zero and a generator's mark. */
const HEAD_BYTES = 8000;

/** Paths git prints with `-z`, from the root. */
function zList(root: string, args: readonly string[]): readonly string[] {
  const read = readGit(root, args);
  return read._tag === "ok" ? read.value.split("\0").filter((path) => path !== "") : [];
}

/**
 * The files the check reads where none is named: the staged ones, added,
 * copied, modified or renamed; where none is staged, the tracked files the
 * working tree changed and the untracked ones git would add.
 * @param root the repository root
 * @returns their paths from the root, sorted, each once
 */
export function filesInPlay(root: string): readonly string[] {
  const staged = zList(root, ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]);
  if (staged.length > 0) return [...new Set(staged)].sort();
  const changed = zList(root, ["diff", "--name-only", "--diff-filter=ACMR", "-z"]);
  const added = zList(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  return [...new Set([...changed, ...added])].sort();
}

/** A file's first bytes, or undefined when it cannot be read. */
function headOf(path: string): Uint8Array | undefined {
  let handle: number | undefined;
  try {
    handle = openSync(path, "r");
    const buffer = new Uint8Array(HEAD_BYTES);
    const read = readSync(handle, buffer, 0, HEAD_BYTES, 0);
    return buffer.subarray(0, read);
  } catch {
    return undefined;
  } finally {
    if (handle !== undefined) closeSync(handle);
  }
}

/**
 * Each file's reading: exempt by a glob, as binary or as generated, or
 * counted by its bytes over four.
 * @param root the repository root
 * @param paths the files, from the root
 * @param exempt the manifest's own exemption globs
 * @returns one reading per file that stands
 */
function fileReadings(
  root: string,
  paths: readonly string[],
  exempt: readonly string[],
): readonly FileReading[] {
  return paths.flatMap((path): FileReading[] => {
    const exemption = exemptionOf(path, exempt);
    if (exemption !== undefined)
      return [{ path, kind: "exempt", why: `${exemption.kind}, by ${exemption.glob}` }];
    const full = join(root, path);
    let bytes: number;
    try {
      const stat = statSync(full);
      if (!stat.isFile()) return [];
      bytes = stat.size;
    } catch {
      return [];
    }
    const head = headOf(full);
    if (head !== undefined && looksBinary(head))
      return [{ path, kind: "exempt", why: "binary data" }];
    if (head !== undefined && markedGenerated(new TextDecoder().decode(head)))
      return [{ path, kind: "exempt", why: "a generated file, by its mark" }];
    return [{ path, kind: "counted", bytes, tokens: tokensOf(bytes) }];
  });
}

/** The arguments `files` takes, a cap and the paths named, or why they do not read. */
type FilesArgs =
  | { readonly kind: "read"; readonly cap: number | undefined; readonly paths: readonly string[] }
  | { readonly kind: "refused"; readonly message: string };

/** Read `files`' arguments, or say why they do not read. */
function filesArgs(argv: readonly string[]): FilesArgs {
  let cap: number | undefined;
  const paths: string[] = [];
  let ended = false;
  for (let at = 0; at < argv.length; at += 1) {
    const arg = argv[at] ?? "";
    if (!ended && arg === "--") ended = true;
    else if (!ended && (arg === "--max-tokens" || arg.startsWith("--max-tokens="))) {
      const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[(at += 1)];
      if (value === undefined || !/^[1-9]\d*$/.test(value))
        return {
          kind: "refused",
          message: "--max-tokens is a whole number of tokens from 1, such as 5000",
        };
      cap = Number(value);
    } else if (!ended && arg.startsWith("-"))
      return {
        kind: "refused",
        message: `unknown argument '${arg}'; check files takes --max-tokens <n> and the files to read`,
      };
    else paths.push(arg);
  }
  return { kind: "read", cap, paths };
}

/**
 * Run `greenline check files`.
 * @param root the repository root
 * @param cwd where it runs, which a named path is read from
 * @param argv the arguments after `files`
 * @param writer greenline's own streams: the report to stdout, a refusal to stderr
 * @returns 0 with every file under the cap, 1 with one over it, 2 for arguments that do not read
 */
export function runCheckFiles(
  root: string,
  cwd: string,
  argv: readonly string[],
  writer: CliWriter,
): number {
  const parsed = filesArgs(argv);
  if (parsed.kind === "refused") {
    writer.stderr.write(`greenline check: ${parsed.message}\n`);
    return EXIT_USAGE;
  }
  const setting = workspaceManifest(root)?.fileTokens;
  const cap = parsed.cap ?? setting?.cap ?? DEFAULT_FILE_TOKENS;
  const named = parsed.paths.map((path) =>
    relative(root, isAbsolute(path) ? path : resolve(cwd, path)),
  );
  const outside = named.find((path) => path.startsWith("..") || isAbsolute(path));
  if (outside !== undefined) {
    writer.stderr.write(`greenline check: '${outside}' lies outside the repository\n`);
    return EXIT_USAGE;
  }
  const paths =
    named.length > 0 ? named.map((path) => path.split(sep).join("/")) : filesInPlay(root);
  const report = fileTokensReport(fileReadings(root, paths, setting?.exempt ?? []), cap);
  writer.stdout.write(report.text);
  return report.green ? EXIT_OK : EXIT_FAILURE;
}
