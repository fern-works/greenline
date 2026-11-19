import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { parseJson } from "./contract.ts";
import type { NormalisedEvent, ReadRange } from "./event.ts";
import { programOf, SHELLS, shellCommands, unwrapped, type Refuses } from "./guardrails.ts";

/**
 * The skill loads (the register's row of 2026-10-22 on the roster's use;
 * J-116 S2): a roster skill is used when one of its files enters the agent's
 * context, which happens only through a tool call the hooks see, the Skill
 * tool, a reading tool or a shell read, so each load is read from the
 * normalised event. The method is the apparatus's reader, lifted: the skill
 * roots `.claude/skills/<name>/<file>` and `.agents/skills/<name>/<file>`, a
 * whole read told from a part by the reading tool's range or by the shell
 * verb and its arguments (`sed -n 'a,bp'`, `head -n N`), and a shell line
 * read for its words the way the guardrails read it (`./guardrails.ts`), its
 * `cd` steps, its variables and its literal loops resolved. A path is a load
 * only where it is a file the installation placed (the lock's paths), so a
 * read outside the roster, the owner's own files among them, is never seen.
 * A load is not an application: the record's sections say what was
 * followed. Pure: the shell resolves the paths and reads the files.
 */

/** The two homes of the installed roster, from the repository's root. */
const SKILL_ROOTS = [".claude/skills", ".agents/skills"] as const;

/** A skill file's path from the root: its root, its skill and the file inside the skill's folder. */
const SKILL_PATH = /^\.(?:claude|agents)\/skills\/([a-z0-9][a-z0-9-]*)\/([^/].*)$/;

/** A path from the repository's root, `/`-separated, read as a skill's file. */
export interface SkillFile {
  readonly skill: string;
  /** The file inside the skill's folder, `SKILL.md` or `references/greenline.md`. */
  readonly file: string;
}

/**
 * The skill and its file a path names, from the root.
 * @param fromRoot the path from the repository's root, `/`-separated
 * @returns the skill and the file, or undefined outside the skill roots
 */
export function skillFileOf(fromRoot: string): SkillFile | undefined {
  const match = SKILL_PATH.exec(fromRoot);
  if (match === null || match[1] === undefined || match[2] === undefined) return undefined;
  if (match[2].split("/").some((part) => part === "" || part === "." || part === ".."))
    return undefined;
  return { skill: match[1], file: match[2] };
}

/** How much of a file a read showed: all of it, a part, or a span of lines to check against the file's length. */
export type Span =
  | { readonly kind: "whole" }
  | { readonly kind: "part" }
  | {
      readonly kind: "lines";
      readonly from: number;
      /** The last line shown, or null for the file's end. */
      readonly to: number | null;
    };

/** What one tool call shows of a skill entering the context, before the shell resolves it. */
export type Sighting =
  | { readonly kind: "skill"; readonly skill: string; readonly via: string }
  | {
      readonly kind: "path";
      /** The path as the call resolves it: absolute, from the directory the call ran in. */
      readonly path: string;
      readonly via: string;
      readonly span: Span;
      /**
       * The lines a pipeline's `head` lets through, shared in order by the
       * files one read prints together, `cat a b | head -n 700` (J-174): the
       * same object for each of those files.
       */
      readonly shared?: { readonly lines: number } | undefined;
    };

/** How many lines a reading tool shows when it is given no limit, Claude Code's 2,000. */
const READ_LIMIT = 2000;

/**
 * The span a reading tool's range shows.
 * @param range the range, null for none
 * @returns the lines from the offset, the default limit where none is given
 */
function spanOfRange(range: ReadRange | null): Span {
  const from = Math.max(1, range?.offset ?? 1);
  const limit = range?.limit ?? READ_LIMIT;
  return { kind: "lines", from, to: from + Math.max(0, limit) - 1 };
}

/** The verbs that print a file whole. */
const WHOLE_VERBS = new Set(["cat", "nl", "bat", "less", "more"]);
/** The verbs that print a part of a file: the matching lines or a program's choice. */
const PART_VERBS = new Set(["grep", "rg", "egrep", "fgrep", "awk"]);
/** Every verb read as a read of its file arguments. */
const READ_VERBS = new Set([...WHOLE_VERBS, ...PART_VERBS, "sed", "head", "tail"]);

/** The programs that print a count or a digest of what they read, never its lines: a read piped to one shows the agent nothing (J-174). */
const COUNTERS = new Set([
  "wc",
  "sum",
  "cksum",
  "md5",
  "md5sum",
  "shasum",
  "sha1sum",
  "sha224sum",
  "sha256sum",
  "sha384sum",
  "sha512sum",
  "b2sum",
]);
/** The programs that pass on what they read whole: a read piped to one still shows the agent all of it. */
const PASSING = new Set(["cat", "nl", "bat", "less", "more", "tee"]);
/** The search verbs, whose count, quiet and file-list options print no line of the file. */
const SEARCHES = new Set(["grep", "egrep", "fgrep", "rg"]);
/** A search's long options that print no line of what it reads. */
const SILENT_LONG =
  /^--(?:count|count-matches|quiet|silent|files-with-matches|files-without-match)$/;

/**
 * Whether a search prints no line of what it reads, only a count, a status
 * or the files' names: `grep -c`, `grep -q`, `grep -l` and their kin (J-174).
 * @param verb the program's name
 * @param args its words after the program
 * @returns true where nothing it reads reaches the agent
 */
function printsNoLine(verb: string, args: readonly string[]): boolean {
  if (!SEARCHES.has(verb)) return false;
  // `rg -L` follows links; grep's `-L` lists the files without a match.
  const short = verb === "rg" ? /^-[a-zA-Z]*[cql]/ : /^-[a-zA-Z]*[cqlL]/;
  return args.some(
    (word) => SILENT_LONG.test(word) || (!word.startsWith("--") && short.test(word)),
  );
}

/** What a read's pipeline lets reach the agent: nothing, a part, or every line, or only the first lines up to a count. */
type Shown =
  | { readonly kind: "none" }
  | { readonly kind: "part" }
  | { readonly kind: "all"; readonly first?: number | undefined };

/**
 * Whether a `cut` narrows the lines it passes on (J-207 S1; j196c-roster-usec
 * finding 2, whose `cut -c1-500` and `cut -c1-700` kept part of a page's
 * longer lines): a list of characters, bytes or fields, `-c`, `-b` or `-f`
 * in a cluster of short options or their long forms. A delimiter's `-d`
 * takes the rest of its word as its value.
 * @param args the cut's words after the program
 * @returns true where it keeps a part of each line
 */
function cutNarrows(args: readonly string[]): boolean {
  return args.some((word) => {
    if (/^--(?:characters|bytes|fields)(?:=|$)/.test(word)) return true;
    if (!word.startsWith("-") || word.startsWith("--")) return false;
    for (const letter of word.slice(1)) {
      if (letter === "c" || letter === "b" || letter === "f") return true;
      if (letter === "d") return false;
    }
    return false;
  });
}

/**
 * What a read's pipeline lets reach the agent of the lines it prints
 * (J-174): none where a later command counts them, digests them or prints
 * no line of them; the first lines up to a count where a later `head -n N`
 * or `sed -n '1,Np'` cuts them; a part where any other later command
 * filters them, a `cut` that narrows its lines by character, byte or field
 * among those (J-207 S1); all of them where each later command passes them
 * on, a `cut` that narrows none among those.
 * @param pipedTo the words of each command after the read in its pipeline
 * @returns what the pipeline shows
 */
function pipelineShows(pipedTo: readonly (readonly string[])[]): Shown {
  let first: number | undefined;
  let part = false;
  for (const words of pipedTo) {
    const run = unwrapped(words);
    const program = programOf(run[0]);
    const args = run.slice(1);
    if (COUNTERS.has(program) || printsNoLine(program, args)) return { kind: "none" };
    if (PASSING.has(program) || (program === "cut" && !cutNarrows(args))) continue;
    const span = program === "head" || program === "sed" ? spanOfVerb(program, args) : undefined;
    if (span?.kind === "lines" && span.from === 1) {
      if (span.to !== null) first = Math.min(first ?? span.to, span.to);
    } else part = true;
  }
  return part ? { kind: "part" } : { kind: "all", first };
}

/**
 * A read's span once its pipeline keeps only the first lines up to a count.
 * @param span the span the read's own verb shows
 * @param first the lines the pipeline keeps from the top
 * @returns the narrowed span
 */
function narrowed(span: Span, first: number): Span {
  if (span.kind === "part") return span;
  if (span.kind === "whole") return { kind: "lines", from: 1, to: first };
  const end = span.from + first - 1;
  return { kind: "lines", from: span.from, to: span.to === null ? end : Math.min(span.to, end) };
}

/** A `sed` script that prints a line range: `a,bp`, the end `$` for the last line. */
const SED_RANGE = /^(\d+),(\d+|\$)p$/;

/**
 * The span a shell verb shows of its files, from its arguments.
 * @param verb the program's name
 * @param args its words after the program
 * @returns the span
 */
function spanOfVerb(verb: string, args: readonly string[]): Span {
  if (WHOLE_VERBS.has(verb)) return { kind: "whole" };
  if (verb === "sed") {
    const quiet = args.some((word) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(word) || word === "--quiet");
    const range = args.map((word) => SED_RANGE.exec(word)).find((match) => match !== null);
    if (!quiet || range === undefined || range === null) return { kind: "part" };
    const end = range[2] === "$" ? null : Number(range[2]);
    return { kind: "lines", from: Number(range[1]), to: end };
  }
  if (verb === "head") {
    if (args.some((word) => word === "-c" || word.startsWith("--bytes") || /^-c\d/.test(word)))
      return { kind: "part" };
    let count = 10;
    args.forEach((word, at) => {
      const joined =
        /^-n(\d+)$/.exec(word) ?? /^--lines=(\d+)$/.exec(word) ?? /^-(\d+)$/.exec(word);
      if (joined?.[1] !== undefined) count = Number(joined[1]);
      else if ((word === "-n" || word === "--lines") && /^\d+$/.test(args[at + 1] ?? ""))
        count = Number(args[at + 1]);
    });
    return { kind: "lines", from: 1, to: count };
  }
  if (verb === "tail") {
    const fromFirst = args.some(
      (word, at) =>
        word === "+1" ||
        word === "-n+1" ||
        word === "--lines=+1" ||
        ((word === "-n" || word === "--lines") && args[at + 1] === "+1"),
    );
    return fromFirst ? { kind: "whole" } : { kind: "part" };
  }
  return { kind: "part" };
}

/** A shell variable's name, its words with or without braces. */
const VARIABLE = /\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g;
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s;
/** A word the shell would expand to names it does not show: a glob, a home or a substitution. */
const UNRESOLVED = /[*?[\]`~]|\$\(|\$[^A-Za-z_{]|\$$/;

/** The values each known variable holds: one for an assignment, each word of a literal loop. */
type Variables = ReadonlyMap<string, readonly string[]>;

/**
 * Each value a word takes once its variables are resolved.
 * @param word the word, its quotes removed
 * @param variables the variables known
 * @returns the values, none where a variable is unknown or the word holds a glob or a substitution
 */
function expand(word: string, variables: Variables): readonly string[] {
  let values: readonly string[] = [""];
  let rest = 0;
  for (const match of word.matchAll(VARIABLE)) {
    const name = match[1] ?? match[2] ?? "";
    const known = variables.get(name);
    if (known === undefined) return [];
    const before = word.slice(rest, match.index);
    values = values.flatMap((value) => known.map((one) => `${value}${before}${one}`));
    rest = (match.index ?? 0) + match[0].length;
  }
  const tail = word.slice(rest);
  // A brace list is each of its words, as the shell expands it before it runs (J-225 S1).
  return values
    .flatMap((value) => braceWords(`${value}${tail}`))
    .filter((value) => !UNRESOLVED.test(value) && value !== "");
}

/** A brace list with no brace inside it and a comma, the first a word holds. */
const BRACE_LIST = /^(.*?)\{([^{}]*,[^{}]*)\}(.*)$/s;
/** The most words one word's brace lists expand to, so a long product stops. */
const BRACE_CAP = 64;

/**
 * The words a word's brace lists expand to, as the shell expands them
 * (J-225 S1; j217t-conduct-runner finding 5, whose reviewer read
 * `references/{greenline.md,lens.md,REGISTER.md,excess.md}` in one `cat`):
 * each list's parts in order, a word with no list, or a brace with no
 * comma, itself.
 * @param word the word, its variables resolved
 * @returns the words, at most {@link BRACE_CAP}
 */
function braceWords(word: string): readonly string[] {
  const list = BRACE_LIST.exec(word);
  if (list === null) return [word];
  const [, before = "", parts = "", after = ""] = list;
  return parts
    .split(",")
    .flatMap((part) => braceWords(`${before}${part}${after}`))
    .slice(0, BRACE_CAP);
}

/** A directory resolved against the one a line stands in, null where the shell's own state names it. */
function changeDirectory(dir: string | null, target: string | undefined, variables: Variables) {
  if (target === undefined || target.startsWith("-")) return null;
  const values = expand(target, variables);
  if (values.length !== 1 || values[0] === undefined) return null;
  if (isAbsolute(values[0])) return resolve(values[0]);
  return dir === null ? null : resolve(dir, values[0]);
}

/** How deep a nested shell's script is read. */
const DEPTH = 6;

/**
 * How a shell line is read for the reads it makes (J-207 S1): `zsh` where
 * zsh runs it, so an unquoted word that opens with an equals sign and is
 * no assignment, `echo =====` among them, is an expansion zsh refuses and
 * the point where the list stops; `refused` where the words the shell
 * refused are known from its error in the tool's result, the stop then
 * read at those words alone, whatever shell the environment names. With
 * neither, the list is read whole, as a shell that expands no such word
 * runs it.
 */
export interface ShellReading {
  readonly zsh?: boolean | undefined;
  readonly refused?: ReadonlySet<string> | undefined;
}

/**
 * The words a reading's shell refuses.
 * @param reading the reading
 * @returns the test, or undefined where the shell refuses none
 */
function refusesOf(reading: ShellReading): Refuses | undefined {
  const refused = reading.refused;
  if (refused !== undefined) return (word) => refused.has(word);
  return reading.zsh === true ? () => true : undefined;
}

/**
 * The reading of a nested shell's script: `eval` and a `zsh -c` keep the
 * line's own, any other shell expands no equals word.
 * @param program the nested shell, or `eval`
 * @param reading the line's reading
 * @returns the script's reading
 */
function nestedReading(program: string, reading: ShellReading): ShellReading {
  if (program === "eval") return reading;
  return program === "zsh" ? { ...reading, zsh: true } : {};
}

/**
 * Whether zsh runs the shell lines the harness hands the hooks (J-207 S1):
 * where the environment names the shell, `SHELL`, zsh by that name; where
 * it names none, zsh on macOS, whose login shell it is, and no other shell
 * elsewhere.
 * @param named the shell the environment names, its path
 * @param platform the platform, as Node names it
 * @returns true where zsh runs them
 */
export function readsAsZsh(named: string | undefined, platform: string): boolean {
  if (named === undefined || named.trim() === "") return platform === "darwin";
  return programOf(named.trim()) === "zsh";
}

/**
 * The files a shell line reads, each with the verb and the span it shows,
 * read for its words as the guardrails read them: a `cd` or `pushd` moves the
 * directory the rest resolves against, unknown after a `cd` to the home, to
 * the last directory or to a word the line cannot resolve; an assignment and
 * a literal `for` loop give their variables; a shell's `-c` script and
 * `eval` are read as lines of their own. Only the read verbs count; `wc`,
 * `ls` and an `echo` of a path put no file's text in the context, and nor
 * does a read whose standard output its pipeline sends to a file or
 * /dev/null (J-143 S2), a read its pipeline counts or digests, or a search
 * that prints a count, a status or the files' names (J-174); a filter later
 * in the pipeline makes the read a part. Under zsh the list stops at a word
 * zsh's equals expansion refuses, and no read after it is a sighting
 * (J-207 S1; the run j196c-roster-usec, whose `echo =====` between two
 * pages printed the first alone).
 * @param text the command line as the harness reported it
 * @param dir the directory it runs in, absolute; null where it is unknown
 * @param reading the shell that runs it, or the words it refused
 * @param depth how deep a nested shell this line is
 * @returns the sightings, in the line's order
 */
export function shellSightings(
  text: string,
  dir: string | null,
  reading: ShellReading = {},
  depth = 0,
): readonly Sighting[] {
  if (depth > DEPTH) return [];
  const out: Sighting[] = [];
  const variables = new Map<string, readonly string[]>();
  let here = dir;
  for (const { words: simple, silenced, pipedTo, unrun } of shellCommands(
    text,
    0,
    refusesOf(reading),
  )) {
    // A command the shell never runs reads nothing, sets nothing and moves nowhere (J-207 S1).
    if (unrun === true) continue;
    const first = simple[0];
    if (first === "for" && simple[2] === "in" && simple[1] !== undefined) {
      const words = simple.slice(3).map((word) => expand(word, variables));
      // A list with a glob or an unknown variable leaves the loop's variable unknown.
      if (words.some((values) => values.length === 0)) variables.delete(simple[1]);
      else variables.set(simple[1], words.flat());
      continue;
    }
    if (simple.length > 0 && simple.every((word) => ASSIGNMENT.test(word))) {
      for (const word of simple) {
        const [, name = "", value = ""] = ASSIGNMENT.exec(word) ?? [];
        const values = expand(value, variables);
        if (values.length === 1) variables.set(name, values);
        else variables.delete(name);
      }
      continue;
    }
    const words = unwrapped(simple);
    const program = programOf(words[0]);
    if (program === "cd" || program === "pushd") {
      here = changeDirectory(
        here,
        words.slice(1).find((word) => word !== "--"),
        variables,
      );
      continue;
    }
    // A read whose output goes to a file or /dev/null puts nothing in the context (J-143 S2).
    if (silenced) continue;
    if (SHELLS.has(program) || program === "eval") {
      const flag = words.findIndex((word, at) => at > 0 && /^-[a-z]*c[a-z]*$/.test(word));
      const script =
        program === "eval" ? words.slice(1).join(" ") : flag === -1 ? undefined : words[flag + 1];
      if (script !== undefined)
        out.push(...shellSightings(script, here, nestedReading(program, reading), depth + 1));
      continue;
    }
    if (!READ_VERBS.has(program)) continue;
    const args = words.slice(1);
    // A read counted, digested or searched for no line shows the agent nothing (J-174).
    const shows = pipelineShows(pipedTo ?? []);
    if (shows.kind === "none" || printsNoLine(program, args)) continue;
    const own = spanOfVerb(program, args);
    const paths: string[] = [];
    for (const word of args) {
      if (word.startsWith("-") || word.startsWith("+")) continue;
      for (const value of expand(word, variables)) {
        if (!isAbsolute(value) && here === null) continue;
        paths.push(resolve(here ?? "/", value));
      }
    }
    // A pipeline's head over one file narrows its span; over several, the files share its lines in order.
    const kept = shows.kind === "all" ? shows.first : undefined;
    const shared =
      kept !== undefined && WHOLE_VERBS.has(program) && paths.length > 1
        ? { lines: kept }
        : undefined;
    const span: Span =
      shows.kind === "part"
        ? { kind: "part" }
        : kept === undefined
          ? own
          : shared === undefined
            ? narrowed(own, kept)
            : own.kind === "whole"
              ? own
              : { kind: "part" };
    for (const path of paths) out.push({ kind: "path", path, via: program, span, shared });
  }
  return out;
}

/**
 * The directories a shell line's commands run in, read as the sightings read
 * them (J-215 S1, the run j196t-conduct-emptyd): each command's directory
 * after the `cd` and `pushd` steps before it, its assignments giving their
 * variables, a shell's `-c` script and `eval` read as lines of their own; a
 * directory the line cannot resolve, a `cd` to the home among them, is left
 * out. The hooks read the checkout a call acts in from them.
 * @param text the command line as the harness reported it
 * @param dir the directory it runs in, absolute
 * @param depth how deep a nested shell this line is
 * @returns the directories, in the line's order, each once
 */
export function shellDirectories(text: string, dir: string, depth = 0): readonly string[] {
  if (depth > DEPTH) return [];
  const out: string[] = [];
  const variables = new Map<string, readonly string[]>();
  let here: string | null = dir;
  for (const { words: simple } of shellCommands(text)) {
    if (simple.length > 0 && simple.every((word) => ASSIGNMENT.test(word))) {
      for (const word of simple) {
        const [, name = "", value = ""] = ASSIGNMENT.exec(word) ?? [];
        const values = expand(value, variables);
        if (values.length === 1) variables.set(name, values);
        else variables.delete(name);
      }
      continue;
    }
    const words = unwrapped(simple);
    const program = programOf(words[0]);
    if (program === "cd" || program === "pushd") {
      here = changeDirectory(
        here,
        words.slice(1).find((word) => word !== "--"),
        variables,
      );
      continue;
    }
    if (SHELLS.has(program) || program === "eval") {
      const flag = words.findIndex((word, at) => at > 0 && /^-[a-z]*c[a-z]*$/.test(word));
      const script =
        program === "eval" ? words.slice(1).join(" ") : flag === -1 ? undefined : words[flag + 1];
      if (script !== undefined && here !== null)
        out.push(...shellDirectories(script, here, depth + 1));
      continue;
    }
    if (here !== null && program !== "") out.push(here);
  }
  return [...new Set(out)];
}

/** A change's id as the CLI's `--change` takes it. */
const CHANGE_WORD = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The changes a shell line's greenline commands name by `--change` (J-215
 * S1): `greenline check --change <id>`, `greenline brief --change <id>` and
 * the rest, a shell's `-c` script and `eval` read as lines of their own.
 * The command's text names its change where the harness hands the hooks no
 * directory, as Codex hands none for its exec call's `workdir`.
 * @param text the command line as the harness reported it
 * @param depth how deep a nested shell this line is
 * @returns the ids, in the line's order, each once
 */
export function changesNamed(text: string, depth = 0): readonly string[] {
  if (depth > DEPTH) return [];
  const out: string[] = [];
  for (const { words: simple } of shellCommands(text)) {
    const words = unwrapped(simple);
    const program = programOf(words[0]);
    if (SHELLS.has(program) || program === "eval") {
      const flag = words.findIndex((word, at) => at > 0 && /^-[a-z]*c[a-z]*$/.test(word));
      const script =
        program === "eval" ? words.slice(1).join(" ") : flag === -1 ? undefined : words[flag + 1];
      if (script !== undefined) out.push(...changesNamed(script, depth + 1));
      continue;
    }
    if (program !== "greenline") continue;
    for (const [at, word] of words.entries()) {
      const id = word.startsWith("--change=")
        ? word.slice("--change=".length)
        : word === "--change"
          ? words[at + 1]
          : undefined;
      if (id !== undefined && CHANGE_WORD.test(id)) out.push(id);
    }
  }
  return [...new Set(out)];
}

/**
 * What a tool call shows of skills entering the context: the Skill tool's
 * skill, a reading tool's paths with its range, and a shell command's reads.
 * @param event the normalised event of a tool call
 * @param base the directory the session stands in, absolute
 * @param reading the shell that runs a shell line, or the words it refused (J-207 S1)
 * @returns the sightings; none for any other event
 */
export function sightingsOf(
  event: NormalisedEvent,
  base: string,
  reading: ShellReading = {},
): readonly Sighting[] {
  if (event.skill !== null && event.tool !== null)
    return [{ kind: "skill", skill: event.skill, via: event.tool.name ?? "Skill" }];
  if (event.read !== null && event.tool !== null) {
    const span = spanOfRange(event.read.range);
    const via = event.tool.name ?? "read";
    return event.read.paths.map((path) => ({
      kind: "path",
      path: resolve(base, path),
      via,
      span,
    }));
  }
  const text = event.command?.text;
  if (text === null || text === undefined) return [];
  const dir = event.command?.dir;
  return shellSightings(
    text,
    dir === null || dir === undefined ? base : resolve(base, dir),
    reading,
  );
}

/**
 * The lines a file holds, its last newline ending a line rather than opening one.
 * @param text the file's text
 * @returns the count
 */
export function lineCount(text: string): number {
  if (text === "") return 0;
  const breaks = text.split("\n").length - 1;
  return text.endsWith("\n") ? breaks : breaks + 1;
}

/**
 * Whether a span shows a file whole.
 * @param span the span
 * @param lines the file's lines
 * @returns true for a whole read
 */
function wholeBySpan(span: Span, lines: number): boolean {
  if (span.kind !== "lines") return span.kind === "whole";
  return span.from <= 1 && (span.to === null || span.to >= lines);
}

/**
 * Why a read that would show a page whole is a part (J-203 S1): `together`,
 * the call printed it with another skill page, so one page per read is
 * broken and the harness may cut the joined result; `cut`, the harness
 * handed the agent a result it cut, its truncation marker in the text.
 */
export type PartCause = "together" | "cut";

/**
 * The cause a fact carries: a part's, or `unrun`, a mark rather than a
 * load (J-207 S1): the shell's error in the result shows the read was never
 * made, so it takes back the load noted before the call ran, and the
 * settled loads every reader takes hold none.
 */
export type LoadCause = PartCause | "unrun";

/** One skill load as a tool call shows it: the skill, its file, whole or part, and the tool or the verb. */
export interface LoadSeen {
  readonly skill: string;
  readonly file: string;
  readonly whole: boolean;
  /** `Skill`, the reading tool's name, or the shell verb, `cat` or `sed`. */
  readonly via: string;
  /** Why the read is a part where one page per read or the harness's cut made it one (J-203 S1), or `unrun` on the mark of a read never made (J-207 S1); absent otherwise. */
  readonly cause?: LoadCause | undefined;
}

/** What the shell gives the reading of sightings: the repository's paths, its roster and its files. */
export interface LoadsReader {
  /** A path's place from the repository's root, `/`-separated; undefined outside it. */
  readonly fromRoot: (path: string) => string | undefined;
  /** Whether a path from the root is a file the installation placed. */
  readonly installed: (fromRoot: string) => boolean;
  /** The lines of a file from the root; undefined when it cannot be read. */
  readonly lines: (fromRoot: string) => number | undefined;
}

/**
 * The loads a tool call's sightings make, each a file of the installed
 * roster: the Skill tool loads the skill's `SKILL.md` whole; a path is a load
 * only inside a skill root, at a file the installation placed. One page per
 * read (J-203 S1; the run j196c-merged-skills, whose one `cat` of tdd's
 * method and ponytail's simplify page came back cut): a call whose reads
 * print more than one skill page shows each as a part, `together`, on every
 * harness, from the command alone.
 * @param sightings what the call shows
 * @param reader the repository's paths and files
 * @returns the loads, in order
 */
export function loadsOf(sightings: readonly Sighting[], reader: LoadsReader): readonly LoadSeen[] {
  const loads = oncePerPage(markedLoadsOf(sightings, reader));
  const pages = new Set(
    loads.flatMap(({ load, path }) => (path ? [`${load.skill}/${load.file}`] : [])),
  );
  return loads.map(({ load, path }) =>
    path && pages.size > 1 ? { ...load, whole: false, cause: "together" as const } : load,
  );
}

/** A load with whether a path's read made it, rather than the Skill tool. */
interface MarkedLoad {
  readonly load: LoadSeen;
  readonly path: boolean;
}

/**
 * One load per skill and file for one call (J-225 S1; j217c-roster-use,
 * whose `cat <page> 2>/dev/null || cat <the same page under the other
 * root>` was noted twice): a page the call names more than once, on both
 * sides of an alternative or under two roots, is one fact at its first
 * place, whole where any of its reads shows it whole, whichever side ran,
 * since one harness's payload carries no exit code.
 * @param loads the call's loads, in order
 * @returns each page once, in the order first read
 */
function oncePerPage(loads: readonly MarkedLoad[]): readonly MarkedLoad[] {
  const pages = new Map<string, MarkedLoad>();
  for (const each of loads) {
    const key = `${each.load.skill}/${each.load.file}`;
    const known = pages.get(key);
    if (known === undefined || (!known.load.whole && each.load.whole)) pages.set(key, each);
  }
  const order = [...new Set(loads.map((each) => `${each.load.skill}/${each.load.file}`))];
  return order.flatMap((key) => pages.get(key) ?? []);
}

/**
 * The loads a call's sightings make, each marked as a path's or the Skill tool's.
 * @param sightings what the call shows
 * @param reader the repository's paths and files
 * @returns the loads, in order
 */
function markedLoadsOf(sightings: readonly Sighting[], reader: LoadsReader): readonly MarkedLoad[] {
  // The lines a pipeline's head has left for the files that share it, in the order they print (J-174).
  const left = new Map<object, number>();
  return sightings.flatMap((sighting): readonly MarkedLoad[] => {
    if (sighting.kind === "skill") {
      const placed = SKILL_ROOTS.some((root) =>
        reader.installed(`${root}/${sighting.skill}/SKILL.md`),
      );
      return placed
        ? [
            {
              load: { skill: sighting.skill, file: "SKILL.md", whole: true, via: sighting.via },
              path: false,
            },
          ]
        : [];
    }
    const where = reader.fromRoot(sighting.path);
    const file = where === undefined ? undefined : skillFileOf(where);
    if (where === undefined || file === undefined || !reader.installed(where)) return [];
    const shared = sighting.shared;
    if (shared !== undefined) {
      const lines = reader.lines(where);
      if (lines === undefined) return [];
      const room = left.get(shared) ?? shared.lines;
      left.set(shared, Math.max(0, room - lines));
      const whole = wholeBySpan(sighting.span, lines) && lines <= room;
      return [{ load: { ...file, whole, via: sighting.via }, path: true }];
    }
    const lines = sighting.span.kind === "lines" ? reader.lines(where) : 0;
    if (lines === undefined) return [];
    const whole = wholeBySpan(sighting.span, lines);
    return [{ load: { ...file, whole, via: sighting.via }, path: true }];
  });
}

/**
 * The loads a call's result shows the harness cut (J-203 S1): where the
 * harness hands the hook the tool's result and its text carries the
 * harness's truncation marker, each load the call made is a part, `cut`. A
 * second reading beside one page per read, never the keeper alone.
 * @param loads the call's loads
 * @returns the same loads, each a part the harness cut
 */
export function cutLoads(loads: readonly LoadSeen[]): readonly LoadSeen[] {
  return loads.map((load) => ({ ...load, whole: false, cause: "cut" as const }));
}

/**
 * The marks of the reads a call never made (J-207 S1): where the harness
 * hands the hook the tool's result and the shell's error in it names a word
 * it refused, the loads noted before the call ran, by the environment's
 * reading of its line, that the reading stopped at that word does not
 * make, each once per load, marked `unrun`. A second reading beside the
 * stop the command's text shows, never the keeper alone.
 * @param noted the loads the environment's reading of the line makes, as the before-tool hook noted them
 * @param ran the loads the reading stopped at the refused words makes
 * @returns the marks, in the order noted
 */
export function unrunLoads(
  noted: readonly LoadSeen[],
  ran: readonly LoadSeen[],
): readonly LoadSeen[] {
  const left = new Map<string, number>();
  for (const load of ran) {
    const key = `${load.skill}/${load.file}`;
    left.set(key, (left.get(key) ?? 0) + 1);
  }
  return noted.flatMap((load) => {
    const key = `${load.skill}/${load.file}`;
    const count = left.get(key) ?? 0;
    if (count > 0) {
      left.set(key, count - 1);
      return [];
    }
    return [{ ...load, whole: false, cause: "unrun" as const }];
  });
}

/**
 * Loads settled against the harness's cuts (J-203 S1): the hooks note a
 * call's loads before it runs and its cut after, so each `cut` load folds
 * into the latest earlier load of the same file by the same agent that is
 * not itself cut, which becomes a part the harness cut; a cut with no such
 * load is kept, a part. An `unrun` mark takes the latest earlier load of
 * the same file by the same agent away and is never kept itself, so a read
 * the shell never made counts nowhere (J-207 S1). Every reader of a
 * change's loads reads them settled, so a cut read counts once, as a part.
 * @param loads the loads, oldest first
 * @returns the loads settled, in order
 */
export function settledLoads<T extends LoadSeen & { readonly agent?: string | null | undefined }>(
  loads: readonly T[],
): readonly T[] {
  const out: T[] = [];
  for (const load of loads) {
    if (load.cause === "unrun") {
      const at = out.findLastIndex(
        (earlier) =>
          earlier.skill === load.skill &&
          earlier.file === load.file &&
          (earlier.agent ?? null) === (load.agent ?? null),
      );
      if (at !== -1) out.splice(at, 1);
      continue;
    }
    if (load.cause !== "cut") {
      out.push(load);
      continue;
    }
    const at = out.findLastIndex(
      (earlier) =>
        earlier.skill === load.skill &&
        earlier.file === load.file &&
        (earlier.agent ?? null) === (load.agent ?? null) &&
        earlier.cause !== "cut",
    );
    const earlier = out[at];
    if (earlier === undefined) out.push(load);
    else out[at] = { ...earlier, whole: false, cause: "cut" };
  }
  return out;
}

/** One load as the change's folder keeps it, under `skills/<date>.jsonl`. */
export interface SkillLoadFact extends LoadSeen {
  readonly at: string;
  /** The step the change's record was in, its current section; null before the record stood. */
  readonly step: string | null;
  /** The fresh agent the harness named; null for the session's own agent. */
  readonly agent: string | null;
  /** The harness session the load happened in, and the turn the hooks numbered; null where the harness names none. */
  readonly session: string | null;
  readonly turn: number | null;
}

/** One load as a session's fact keeps it, with the change it was noted in, null while it belongs to none. */
export interface SessionLoad extends LoadSeen {
  readonly at: string;
  readonly step: string | null;
  readonly agent: string | null;
  readonly turn: number | null;
  readonly noted: string | null;
}

/**
 * The sessions' folder's `.gitignore`, `.greenline/ledger/sessions/.gitignore`
 * (J-135 S2): it ignores every file there, itself among them, so a session's
 * own loads stay local to the clone, out of every commit and out of
 * `git clean -f`'s reach, while a change's loads stay in its own folder.
 */
export const SESSIONS_GITIGNORE: string =
  "# greenline: each session's own skill loads, local to this clone.\n" +
  "# Nothing here is committed; a change's loads stay in its own folder.\n" +
  "*\n";

/** One line of a session's fact, `.greenline/ledger/sessions/<date>-<session>.jsonl`: a load, or the change the session opened or resumed at a turn. */
export type SessionLine =
  | SessionLoad
  | { readonly change: string; readonly turn: number | null; readonly at: string };

const name = z.string().min(1);
const nullableName = name.nullable();
const turn = z.number().int().min(0).nullable();
const seen = {
  skill: name,
  file: name,
  whole: z.boolean(),
  via: name,
  cause: z.enum(["together", "cut", "unrun"]).optional(),
  at: name,
  step: nullableName,
  agent: nullableName,
};
const changeLine: z.ZodType<SkillLoadFact> = z
  .object({ ...seen, session: nullableName, turn })
  .strict();
const sessionLine: z.ZodType<SessionLine> = z.union([
  z.object({ ...seen, turn, noted: nullableName }).strict(),
  z.object({ change: name, turn, at: name }).strict(),
]);

/** The lines of a JSON Lines file that read under a schema; a line that does not is left out. */
function readLines<T>(text: string, schema: z.ZodType<T>): readonly T[] {
  return text.split("\n").flatMap((line) => {
    if (line.trim() === "") return [];
    const read = schema.safeParse(parseJson(line));
    return read.success ? [read.data] : [];
  });
}

/**
 * A change's loads from one of its `skills/<date>.jsonl` files.
 * @param text the file's text
 * @returns the loads; a line that does not read is left out
 */
export function parseChangeLoads(text: string): readonly SkillLoadFact[] {
  return readLines(text, changeLine);
}

/**
 * Loads oldest first, by their time, a tie kept in the order read.
 * @param loads the loads, as their files hold them
 * @returns the loads, sorted
 */
export function oldestFirst<T extends { readonly at: string }>(loads: readonly T[]): readonly T[] {
  return loads
    .map((load, order) => ({ load, order }))
    .sort((a, b) => a.load.at.localeCompare(b.load.at) || a.order - b.order)
    .map(({ load }) => load);
}

/** A load's identity across a session's fact and a change's files: everything but the session that noted it. */
function loadIdentity(load: Omit<SkillLoadFact, "session">): string {
  return JSON.stringify([
    load.at,
    load.skill,
    load.file,
    load.whole,
    load.via,
    load.cause ?? null,
    load.step,
    load.agent,
    load.turn,
  ]);
}

/**
 * Loads kept one fact per load (J-205 S1, the run j196t-conduct-emptyb,
 * whose farewell change's files held one tdd load three times while the
 * session's fact held it once): the first of the loads that share a file,
 * a time, an agent and every other part of a load's identity, whatever
 * session each names, in the order given.
 * @param loads the loads
 * @returns the loads, each once
 */
export function onePerLoad<T extends Omit<SkillLoadFact, "session">>(
  loads: readonly T[],
): readonly T[] {
  const kept = new Set<string>();
  return loads.filter((load) => {
    const key = loadIdentity(load);
    if (kept.has(key)) return false;
    kept.add(key);
    return true;
  });
}

/**
 * The loads the sessions' facts gave a change (J-198 S1), as the hooks
 * appended them to its files: each load a session noted in it, and each
 * load a session noted for no change before it named the change, which the
 * naming joined to it; each load once, where the fact holds it more than
 * once (J-205 S1).
 * @param id the change
 * @param session the session's id, as its fact's file names it
 * @param lines the session's fact
 * @returns the loads, in the fact's order, each with the session
 */
export function sessionLoadsOf(
  id: string,
  session: string,
  lines: readonly SessionLine[],
): readonly SkillLoadFact[] {
  const loads: SkillLoadFact[] = [];
  let unjoined: SkillLoadFact[] = [];
  for (const line of lines) {
    if ("change" in line) {
      if (line.change === id) loads.push(...unjoined);
      unjoined = [];
      continue;
    }
    const { noted, ...load } = line;
    if (noted === null) unjoined.push({ ...load, session });
    else if (noted === id) loads.push({ ...load, session });
  }
  return onePerLoad(loads);
}

/**
 * The loads the sessions' facts gave a change that its files no longer hold
 * (J-198 S1): what a reset of the tree, a checkout or a merge took from the
 * change's committed files while the sessions' local facts kept it. Each
 * side is kept one fact per load (J-205 S1), and each load is matched
 * once, so a load the sessions noted is missing only where the files hold
 * no fact of it, and is missing once however often either side holds it.
 * @param kept the change's loads as its files hold them
 * @param noted the loads the sessions' facts gave it
 * @returns the loads its files lack, in the order noted
 */
export function loadsMissing(
  kept: readonly SkillLoadFact[],
  noted: readonly SkillLoadFact[],
): readonly SkillLoadFact[] {
  const held = new Map<string, number>();
  for (const load of onePerLoad(kept)) {
    const key = loadIdentity(load);
    held.set(key, (held.get(key) ?? 0) + 1);
  }
  return onePerLoad(noted).filter((load) => {
    const key = loadIdentity(load);
    const left = held.get(key) ?? 0;
    if (left === 0) return true;
    held.set(key, left - 1);
    return false;
  });
}

/**
 * A session's fact.
 * @param text the file's text
 * @returns its lines; a line that does not read is left out
 */
export function parseSessionFact(text: string): readonly SessionLine[] {
  return readLines(text, sessionLine);
}

/** One skill's loads summarised: how many, whole and part, the files and the steps. */
export interface SkillUse {
  readonly skill: string;
  readonly loads: number;
  readonly whole: number;
  readonly part: number;
  /** The steps it loaded at, in the order first seen; a load before the record stood names none. */
  readonly steps: readonly string[];
  /** Its loads before the change's record stood, which name no step. */
  readonly beforeRecord: number;
}

/**
 * The loads summarised per skill, in the order each skill was first loaded.
 * @param loads the loads, oldest first
 * @returns one entry per skill
 */
export function summariseLoads(
  loads: readonly (LoadSeen & { readonly step?: string | null })[],
): readonly SkillUse[] {
  const uses = new Map<
    string,
    { loads: number; whole: number; part: number; steps: string[]; beforeRecord: number }
  >();
  for (const load of loads) {
    const use = uses.get(load.skill) ?? {
      loads: 0,
      whole: 0,
      part: 0,
      steps: [],
      beforeRecord: 0,
    };
    use.loads += 1;
    if (load.whole) use.whole += 1;
    else use.part += 1;
    const step = load.step ?? null;
    if (step === null) use.beforeRecord += 1;
    else if (!use.steps.includes(step)) use.steps.push(step);
    uses.set(load.skill, use);
  }
  return [...uses.entries()].map(([skill, use]): SkillUse => ({ skill, ...use }));
}

/**
 * The status mirror's line for a change's loads (J-107's mirror lines, J-116
 * S3): each skill in the order first loaded, marked `(part)` where no load of
 * it was whole; undefined while it has none, so the line is printed only
 * when it holds a fact.
 * @param loads the change's loads
 * @returns the line, unindented
 */
export function loadsLine(loads: readonly LoadSeen[]): string | undefined {
  if (loads.length === 0) return undefined;
  const skills = summariseLoads(loads).map((use) =>
    use.whole === 0 ? `${use.skill} (part)` : use.skill,
  );
  return `skills loaded: ${skills.join(", ")}`;
}

/** A skill's name written as inline code in a record's section. */
const NAMED = /`([a-z0-9][a-z0-9-]*)`/g;

/**
 * The skills a record's sections declare followed: each roster skill a
 * section names as inline code, `tdd`, the block's rule that a step's section
 * names the skills it followed.
 * @param sections the sections' text
 * @param roster the roster's skill names
 * @returns the skills named, sorted
 */
export function declaredSkills(
  sections: readonly string[],
  roster: ReadonlySet<string>,
): readonly string[] {
  const named = new Set<string>();
  for (const text of sections)
    for (const match of text.matchAll(NAMED))
      if (match[1] !== undefined && roster.has(match[1])) named.add(match[1]);
  return [...named].sort();
}

/** The declared skills beside the loaded: the three lists the close and the viewer read together. */
export interface DeclaredBesideLoaded {
  readonly declaredAndLoaded: readonly string[];
  readonly loadedNotDeclared: readonly string[];
  readonly declaredNeverLoaded: readonly string[];
}

/**
 * The declared skills beside the loaded.
 * @param declared the skills the sections name
 * @param loaded the skills the facts hold
 * @returns the three lists, each sorted
 */
export function declaredBesideLoaded(
  declared: readonly string[],
  loaded: readonly string[],
): DeclaredBesideLoaded {
  const named = new Set(declared);
  const seenSet = new Set(loaded);
  return {
    declaredAndLoaded: [...named].filter((skill) => seenSet.has(skill)).sort(),
    loadedNotDeclared: [...seenSet].filter((skill) => !named.has(skill)).sort(),
    declaredNeverLoaded: [...named].filter((skill) => !seenSet.has(skill)).sort(),
  };
}

/**
 * The roster's skill names a lock's paths hold, from the skill roots.
 * @param paths the installed paths, from the root
 * @returns the skill names
 */
export function rosterNamesOf(paths: Iterable<string>): ReadonlySet<string> {
  const names = new Set<string>();
  for (const path of paths) {
    const file = skillFileOf(path);
    if (file !== undefined) names.add(file.skill);
  }
  return names;
}
