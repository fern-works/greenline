/**
 * The guardrails (the register's row of 2026-10-22 on the guardrails; J-114
 * S3): the git commands that throw a change's work away or rewrite a branch,
 * which `greenline event` refuses before the shell runs them unless the
 * record's line holds the owner's words. The list is mattpocock's
 * git-guardrails, lifted as data; its settings file and its match of a
 * substring in the whole command are not taken. A command is read for its
 * words the way a POSIX shell splits them, so `git -C <dir> reset --hard`
 * and `git clean -fd` are found and a commit message or an echo that only
 * quotes `reset --hard` is not: a quoted word is one word, a here-document's
 * body is data, and only a command's first word names its program, with a
 * command substitution, `sh -c` and `eval` read as commands of their own.
 * Pure: the shell resolves the directories and reads the record.
 *
 * A line lifts an act only when its words are the owner's (J-176 S1; the
 * register's row of 2026-11-05, "The keeper over the oracle"): where the
 * hooks journaled the owner's messages for the session, one of them holds
 * the line's words, as the yes line is held; where the harness hands the
 * hooks no owner text, a push to the default branch stays refused, and the
 * owner pushes from their own terminal.
 */

import { saidByOwner, unownedWords, type OwnerJournal } from "./record-lines.ts";

/** A record line that lifts a guardrail. */
export type GuardLine = "discard" | "rebase" | "landing";

/** One act the guardrails refuse. */
export type GuardAct =
  | { readonly kind: "discard"; readonly command: string }
  | {
      readonly kind: "branch-delete";
      readonly command: string;
      /** The branches the command names. */
      readonly branches: readonly string[];
    }
  | {
      readonly kind: "force-push";
      readonly command: string;
      /** The branches it pushes over, as a push's are read (J-173 S1); `null` for many at once. */
      readonly targets: readonly string[] | null;
      /** What each target is pushed from, in its order, read where the targets are (J-188 S1). */
      readonly sources?: readonly string[] | null;
    }
  | {
      readonly kind: "push";
      readonly command: string;
      /** The branches it pushes to: none named for the current branch's own push, `null` for many at once. */
      readonly targets: readonly string[] | null;
      /** What each target is pushed from, in its order, read where the targets are (J-188 S1). */
      readonly sources?: readonly string[] | null;
    };

/** One git invocation a command line runs. */
export interface GitInvocation {
  /** The `cd` and `-C` steps before it, in order, each as written; an absolute one restarts. */
  readonly dirs: readonly string[];
  readonly subcommand: string;
  readonly args: readonly string[];
  /** The invocation's words as one line, as a refusal quotes them. */
  readonly text: string;
}

/** The operators that end a simple command. */
const OPERATORS = ["&&", "||", ";;", "|&", ";", "|", "&", "(", ")", "\n"];
/** A redirection, whose next word is a file and never an argument. */
const REDIRECTION = /^(\d*|&)(>>|>&|>\||<<<|<<-|<<|<>|<&|>|<)$/;
/** A redirection with its file joined to it, whose file is no argument. */
const JOINED_REDIRECTION = /^(\d*|&)(>>|>&|>\||<<<|<>|<&|>|<)\S/;
/** How deep a substitution or a nested shell is read. */
const DEPTH = 6;

/** One word read from the text: its text with the quotes removed, and the command lines its substitutions hold. */
interface Word {
  readonly text: string;
  readonly nested: readonly string[];
  /** Whether any part of it was quoted or escaped, so it is no operator. */
  readonly quoted: boolean;
  /** Whether it opens with an equals sign neither quoted nor escaped, which zsh's equals expansion reads (J-207 S1). */
  readonly equals: boolean;
}

/** A here-document's body read from the text, and the index after its delimiter's line. */
interface HeredocBody {
  readonly text: string;
  readonly end: number;
}

/** A here-document's body, from the start of the line after its operator. */
function heredocBody(line: string, from: number, delimiter: string, strip: boolean): HeredocBody {
  let index = from;
  while (index < line.length) {
    const end = line.indexOf("\n", index);
    const raw = line.slice(index, end === -1 ? line.length : end);
    const next = end === -1 ? line.length : end + 1;
    if ((strip ? raw.replace(/^\t+/, "") : raw) === delimiter)
      return { text: line.slice(from, index), end: next };
    index = next;
  }
  return { text: line.slice(from), end: line.length };
}

/** The index after a here-document's body, from the start of the line after its operator. */
function afterHeredoc(line: string, from: number, delimiter: string, strip: boolean): number {
  return heredocBody(line, from, delimiter, strip).end;
}

/** A here-document's operator at the index: its delimiter, whether it strips tabs, and where the operator ends. */
function heredocAt(
  line: string,
  index: number,
): { readonly delimiter: string; readonly strip: boolean; readonly end: number } | undefined {
  if (!line.startsWith("<<", index) || line.startsWith("<<<", index)) return undefined;
  let at = index + 2;
  const strip = line[at] === "-";
  if (strip) at += 1;
  while (line[at] === " " || line[at] === "\t") at += 1;
  const word = readWord(line, at);
  return word.word.text === "" ? undefined : { delimiter: word.word.text, strip, end: word.end };
}

/** The index of the `)` that closes a `$(` whose text starts at the index, over nesting, quotes and here-documents. */
function substitutionEnd(line: string, start: number): number {
  let level = 1;
  let index = start;
  const pending: { delimiter: string; strip: boolean }[] = [];
  while (index < line.length) {
    const char = line[index];
    const heredoc = heredocAt(line, index);
    if (heredoc !== undefined) {
      pending.push({ delimiter: heredoc.delimiter, strip: heredoc.strip });
      index = heredoc.end;
    } else if (char === "\n") {
      index += 1;
      for (const { delimiter, strip } of pending.splice(0))
        index = afterHeredoc(line, index, delimiter, strip);
    } else if (char === "\\") index += 2;
    else if (char === "'") {
      const close = line.indexOf("'", index + 1);
      index = close === -1 ? line.length : close + 1;
    } else if (char === '"') index = quotedEnd(line, index + 1);
    else if (char === "(") {
      level += 1;
      index += 1;
    } else if (char === ")") {
      level -= 1;
      if (level === 0) return index;
      index += 1;
    } else index += 1;
  }
  return line.length;
}

/** The index after a double-quoted string's closing quote, from just after its opening one. */
function quotedEnd(line: string, start: number): number {
  let index = start;
  while (index < line.length) {
    const char = line[index];
    if (char === "\\") index += 2;
    else if (char === '"') return index + 1;
    else if (char === "$" && line[index + 1] === "(") index = substitutionEnd(line, index + 2) + 1;
    else index += 1;
  }
  return line.length;
}

/** The index after a backquoted substitution, from just after its opening backquote. */
function backquoteEnd(line: string, start: number): number {
  let index = start;
  while (index < line.length) {
    if (line[index] === "\\") index += 2;
    else if (line[index] === "`") return index;
    else index += 1;
  }
  return line.length;
}

/** One word from the index, and where it ends. */
/** A word read from the text, and the index where it ends. */
interface WordRead {
  readonly word: Word;
  readonly end: number;
}

function readWord(line: string, start: number): WordRead {
  let text = "";
  let quoted = false;
  const nested: string[] = [];
  let index = start;
  const equals = line[start] === "=";
  const dollar = (): void => {
    const close = substitutionEnd(line, index + 2);
    nested.push(line.slice(index + 2, close));
    text += line.slice(index, Math.min(close + 1, line.length));
    index = close + 1;
  };
  const backquote = (): void => {
    const close = backquoteEnd(line, index + 1);
    nested.push(line.slice(index + 1, close));
    text += line.slice(index, Math.min(close + 1, line.length));
    index = close + 1;
  };
  while (index < line.length) {
    const char = line[index] ?? "";
    if (char === " " || char === "\t") break;
    const both = text === "" && line.startsWith("&>", index);
    // A descriptor's duplication, `2>&1` or `>&2`, is one word, never a background operator (J-148 S1).
    const duplication = char === "&" && /^\d*[<>]$/.test(text);
    if (!both && !duplication && OPERATORS.some((operator) => line.startsWith(operator, index)))
      break;
    // A redirection's operator ends the word before it, `cat<<EOF` and `a>log`, unless the word is its descriptor.
    if ((char === "<" || char === ">") && !/^(\d*|&)[<>]*$/.test(text)) break;
    if (char === "\\") {
      quoted = true;
      text += line[index + 1] ?? "";
      index += 2;
    } else if (char === "'") {
      quoted = true;
      const close = line.indexOf("'", index + 1);
      text += line.slice(index + 1, close === -1 ? line.length : close);
      index = close === -1 ? line.length : close + 1;
    } else if (char === '"') {
      quoted = true;
      index += 1;
      while (index < line.length && line[index] !== '"') {
        const inner = line[index] ?? "";
        if (inner === "\\" && '"\\$`\n'.includes(line[index + 1] ?? "")) {
          text += line[index + 1] ?? "";
          index += 2;
        } else if (inner === "$" && line[index + 1] === "(") dollar();
        else if (inner === "`") backquote();
        else {
          text += inner;
          index += 1;
        }
      }
      index += 1;
    } else if (char === "$" && line[index + 1] === "(") dollar();
    else if (char === "`") backquote();
    else {
      text += char;
      index += 1;
    }
  }
  return { word: { text, nested, quoted, equals }, end: index };
}

/**
 * The simple commands a command line runs, each its words, split the way a
 * POSIX shell splits them; a substitution's text is read as a command line
 * of its own, its commands after the one that holds it.
 * @param line the command line
 * @param depth how deep a substitution this line is
 * @returns each simple command's words, in order
 */
function simpleCommands(line: string, depth = 0): readonly (readonly string[])[] {
  return shellCommands(line, depth).map((command) => command.words);
}

/** One simple command a line runs: its words, and whether its standard output reaches no reader. */
export interface ShellCommand {
  readonly words: readonly string[];
  /**
   * True where the command's standard output goes to a file or /dev/null,
   * its own redirection's or a later command's of its pipeline, so nothing
   * it prints reaches the harness (J-143 S2). A substitution's commands and
   * a here-document's are never silenced here.
   */
  readonly silenced: boolean;
  /** True where the shell runs it in the background: the `&` operator ends it (J-148 S1). */
  readonly background?: boolean;
  /** The files its redirections write, each as written: `>`, `>>`, `>|`, `&>` and `<>` (J-173 S1). */
  readonly writes?: readonly string[];
  /** The text its standard input is given by a here-document or a here-string, which an interpreter reads as its script (J-173 S1). */
  readonly stdin?: string;
  /**
   * The words of each command after it in its pipeline, in order, which read
   * what it prints before anything reaches the harness (J-174): none where
   * it ends its pipeline.
   */
  readonly pipedTo?: readonly (readonly string[])[];
  /**
   * True where the shell never runs it, or runs it with nothing it prints
   * reaching the harness, read only where the caller names the words the
   * shell refuses (J-207 S1): zsh's equals expansion refuses an unquoted
   * word that opens with `=` and names no program, so the command holding
   * it never runs, and where that command runs in the shell itself, the
   * last of its pipeline and not in the background, the shell stops the
   * list there: every later command of the line, or of the subshell it
   * stands in, never runs, and the pipeline before it prints to no one.
   */
  readonly unrun?: boolean;
}

/** A simple command while its line is read: its silence and its background set as the operators after it are met. */
interface PipelineCommand {
  readonly words: readonly string[];
  silenced: boolean;
  background?: boolean;
  writes?: readonly string[];
  stdin?: string;
  pipedTo?: readonly (readonly string[])[];
  unrun?: boolean;
}

/** Which words a shell refuses to expand, so the command that holds one never runs (J-207 S1). */
export type Refuses = (word: string) => boolean;

/**
 * Whether a command's words hold one the shell refuses (J-207 S1): an
 * unquoted word that opens with `=` and is more than the sign alone, as
 * zsh's equals expansion reads it, outside a `[[ ... ]]` test, whose words
 * zsh does not expand so; a `[` or `test` command's `==` is refused.
 * @param words the command's words
 * @param refuses the words the shell refuses
 * @returns true where one is refused
 */
function refusedIn(words: readonly Word[], refuses: Refuses): boolean {
  let test = false;
  for (const word of words) {
    if (!word.quoted && word.text === "[[") test = true;
    else if (!word.quoted && word.text === "]]") test = false;
    else if (!test && word.equals && word.text !== "=" && refuses(word.text)) return true;
  }
  return false;
}

/**
 * The file a redirection writes, or undefined for one that only reads or
 * duplicates a descriptor: `>`, `>>`, `>|`, `&>`, `&>>` and `<>` onto a
 * file, and `>&` onto a file rather than a descriptor.
 * @param operator the redirection's descriptor and operator, its file joined or not
 * @param target the file it names, where it stands apart
 * @returns the file written, or undefined
 */
function writtenFile(operator: string, target: string): string | undefined {
  const parts = REDIRECTION_PARTS.exec(operator);
  if (parts === null) return undefined;
  const [, , op = "", joined = ""] = parts;
  const file = joined === "" ? target : joined;
  if (file === "") return undefined;
  if (op === ">" || op === ">>" || op === ">|" || op === "<>") return file;
  return op === ">&" && !/^(\d+-?|-)$/.test(file) ? file : undefined;
}

/** A redirection's descriptor, operator and joined file. */
const REDIRECTION_PARTS = /^(\d*|&)(>>|>&|>\||<<<|<<-|<<|<>|<&|>|<)(.*)$/s;

/**
 * Whether a redirection sends the standard output to a file: `>`, `>>`,
 * `>|` and `&>` to a file, `/dev/null` among them, and `>&` to a file, never
 * to a descriptor such as `>&2`.
 * @param operator the redirection's descriptor and operator, its file joined or not
 * @param target the file it names, where it stands apart
 * @returns true where the standard output goes to a file
 */
function sendsOutputAway(operator: string, target: string): boolean {
  const parts = REDIRECTION_PARTS.exec(operator);
  if (parts === null) return false;
  const [, fd = "", op = "", joined = ""] = parts;
  const file = joined === "" ? target : joined;
  if (!(fd === "" || fd === "1" || fd === "&") || file === "") return false;
  if (op === ">" || op === ">>" || op === ">|") return true;
  return op === ">&" && !/^(\d+-?|-)$/.test(file);
}

/**
 * The simple commands a command line runs, split as {@link simpleCommands}
 * splits them, each with whether its standard output reaches no reader: a
 * pipeline whose last command sends its output to a file silences every
 * command before it too. Where the caller names the words the shell
 * refuses, each command the shell never runs is marked `unrun` (J-207 S1);
 * the guardrails' own readings name none, so their reading holds.
 * @param line the command line
 * @param depth how deep a substitution this line is
 * @param refuses the unquoted words opening with `=` the shell refuses, as zsh's equals expansion does; none for a shell that expands no such word
 * @returns each simple command, in order
 */
export function shellCommands(line: string, depth = 0, refuses?: Refuses): readonly ShellCommand[] {
  if (depth > DEPTH) return [];
  const out: ShellCommand[] = [];
  // The subshells the reading stands in, and the depth at which a refused word stopped the list, null while none has.
  let parens = 0;
  let stopped: number | null = null;
  // The command holding a refused word, until the operator after it says whether the list stops there.
  let refusing: PipelineCommand | undefined;
  let words: Word[] = [];
  let redirected = false;
  let writes: string[] = [];
  let stdin: string | undefined;
  let pipeline: PipelineCommand[] = [];
  const pending: { delimiter: string; strip: boolean; holder: readonly Word[] }[] = [];
  // The command each words list became, so a here-document read after it gives it its input.
  const commandOf = new Map<readonly Word[], PipelineCommand>();
  // The command the last flush ended, which a `&` after it runs in the background.
  let ended: PipelineCommand | undefined;
  const flush = (): void => {
    // The command a `&` after it runs in the background is the last one flushed, a group's last through its `)`.
    let unrun = stopped !== null;
    if (words.length > 0 || writes.length > 0) {
      const command: PipelineCommand = {
        words: words.map((word) => word.text),
        silenced: redirected,
      };
      if (writes.length > 0) command.writes = writes;
      if (stdin !== undefined) command.stdin = stdin;
      if (!unrun && refuses !== undefined && refusedIn(words, refuses)) {
        unrun = true;
        refusing = command;
      }
      if (unrun) command.unrun = true;
      out.push(command);
      pipeline.push(command);
      commandOf.set(words, command);
      ended = command;
    }
    // A substitution runs in its own process, so its own stop stays inside it; a command that never runs expands none.
    for (const word of words)
      for (const inner of word.nested)
        out.push(
          ...shellCommands(inner, depth + 1, refuses).map((command) =>
            unrun ? { ...command, unrun: true } : command,
          ),
        );
    words = [];
    redirected = false;
    writes = [];
    stdin = undefined;
  };
  // A command's output reaches a reader only where its own and every later command's of its pipeline does.
  const endPipeline = (): void => {
    let reaches = true;
    for (const command of [...pipeline].reverse()) {
      reaches = reaches && !command.silenced;
      command.silenced = !reaches;
    }
    // Each command's readers in its pipeline, the ones after it (J-174).
    pipeline.forEach((command, at) => {
      if (at < pipeline.length - 1)
        command.pipedTo = pipeline.slice(at + 1).map((later) => later.words);
    });
    pipeline = [];
  };
  // At the operator after a command: a refused word in a command the shell runs itself stops the list (J-207 S1).
  const stopAt = (operator: string): void => {
    if (refusing !== undefined) {
      // A pipeline's earlier command and a background job run in a process of their own, so the list goes on.
      if (operator !== "|" && operator !== "|&" && operator !== "&") {
        stopped = parens;
        for (const command of pipeline) command.unrun = true;
      }
      refusing = undefined;
    }
    if (operator === "(") parens += 1;
    if (operator === ")") {
      parens = Math.max(0, parens - 1);
      // Leaving the subshell the list stopped in, the commands after it run.
      if (stopped !== null && parens < stopped) stopped = null;
    }
  };
  let index = 0;
  while (index < line.length) {
    const char = line[index] ?? "";
    if (char === " " || char === "\t") {
      index += 1;
      continue;
    }
    if (char === "\\" && line[index + 1] === "\n") {
      index += 2;
      continue;
    }
    if (char === "#") {
      const end = line.indexOf("\n", index);
      index = end === -1 ? line.length : end;
      continue;
    }
    const heredoc = heredocAt(line, index);
    if (heredoc !== undefined) {
      pending.push({ delimiter: heredoc.delimiter, strip: heredoc.strip, holder: words });
      index = heredoc.end;
      continue;
    }
    // `&>` sends both outputs to a file; it is a redirection, never the background operator.
    const operator = line.startsWith("&>", index)
      ? undefined
      : OPERATORS.find((candidate) => line.startsWith(candidate, index));
    if (operator !== undefined) {
      flush();
      if (operator === "&" && ended !== undefined) ended.background = true;
      stopAt(operator);
      if (operator !== "|" && operator !== "|&") endPipeline();
      index += operator.length;
      if (operator === "\n")
        for (const { delimiter, strip, holder } of pending.splice(0)) {
          const body = heredocBody(line, index, delimiter, strip);
          index = body.end;
          // A shell given no script reads its commands from the here-document.
          if (readsStdin(holder.map((word) => word.text)))
            out.push(
              ...shellCommands(
                body.text,
                depth + 1,
                programOf(unwrapped(holder.map((word) => word.text))[0]) === "zsh"
                  ? refuses
                  : undefined,
              ).map((command) =>
                commandOf.get(holder)?.unrun === true ? { ...command, unrun: true } : command,
              ),
            );
          else {
            // Any other program is given it as its input, an interpreter's script among them (J-173 S1).
            const command = commandOf.get(holder);
            if (command !== undefined) command.stdin = body.text;
          }
        }
      continue;
    }
    const read = readWord(line, index);
    index = read.end;
    if (!read.word.quoted && REDIRECTION.test(read.word.text)) {
      // The redirection's file is no argument of the command.
      while (line[index] === " " || line[index] === "\t") index += 1;
      if (
        index < line.length &&
        !OPERATORS.some((candidate) => line.startsWith(candidate, index))
      ) {
        const target = readWord(line, index);
        index = target.end;
        if (sendsOutputAway(read.word.text, target.word.text)) redirected = true;
        const file = writtenFile(read.word.text, target.word.text);
        if (file !== undefined) writes.push(file);
        if (read.word.text.endsWith("<<<")) stdin = target.word.text;
      }
      continue;
    }
    // A word that ends with a redirection's operator joined to it, `2>&1`, is no argument either.
    if (!read.word.quoted && /^\d*[<>]&?\d*-?$/.test(read.word.text)) continue;
    // Nor is a redirection with its file joined to it, `2>/dev/null` or `>log`.
    if (!read.word.quoted && JOINED_REDIRECTION.test(read.word.text)) {
      if (sendsOutputAway(read.word.text, "")) redirected = true;
      const file = writtenFile(read.word.text, "");
      if (file !== undefined) writes.push(file);
      continue;
    }
    words.push(read.word);
  }
  flush();
  stopAt(";");
  endPipeline();
  return out;
}

/** The wrappers a command runs another command under, each with its options that take the next word as their value. */
const WRAPPERS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["env", new Set(["-u", "-C", "-S", "--unset", "--chdir"])],
  ["command", new Set<string>()],
  ["builtin", new Set<string>()],
  ["exec", new Set(["-a"])],
  ["nohup", new Set<string>()],
  ["time", new Set(["-f", "-o"])],
  ["sudo", new Set(["-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-U"])],
  ["doas", new Set(["-u", "-C"])],
  ["xargs", new Set(["-I", "-L", "-n", "-P", "-s", "-d", "-E", "-a"])],
  ["nice", new Set(["-n"])],
]);
/** The shells whose `-c` script is read as a command line of its own. */
export const SHELLS: ReadonlySet<string> = new Set(["sh", "bash", "zsh", "dash", "ksh", "fish"]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
/** The words before a command that the shell reads as its own: a group, a negation and a compound command's keywords. */
const RESERVED = new Set(["{", "}", "!", "if", "then", "else", "elif", "do", "while", "until"]);

/** Whether a command is a shell given no script, so it reads its commands from its input. */
function readsStdin(words: readonly string[]): boolean {
  const run = unwrapped(words);
  return (
    SHELLS.has(programOf(run[0])) &&
    run.slice(1).every((word) => word.startsWith("-") && !/^-[a-z]*c[a-z]*$/.test(word))
  );
}

/** A program's name, its directories left off. */
export function programOf(word: string | undefined): string {
  return word === undefined ? "" : word.slice(word.lastIndexOf("/") + 1);
}

/**
 * The words after one wrapper, `timeout` or one of {@link WRAPPERS} with its
 * options, from a list that begins with it; undefined where it begins with
 * no wrapper.
 */
function afterWrapper(rest: readonly string[]): readonly string[] | undefined {
  const program = programOf(rest[0]);
  if (program === "timeout") {
    let at = 1;
    while (at < rest.length && (rest[at] ?? "").startsWith("-"))
      at += ["-s", "-k", "--signal", "--kill-after"].includes(rest[at] ?? "") ? 2 : 1;
    return rest.slice(at + 1);
  }
  const valued = WRAPPERS.get(program);
  if (valued === undefined) return undefined;
  let at = 1;
  while (
    at < rest.length &&
    ((rest[at] ?? "").startsWith("-") || (program === "env" && ASSIGNMENT.test(rest[at] ?? "")))
  )
    at += valued.has(rest[at] ?? "") ? 2 : 1;
  return rest.slice(at);
}

/** The words of the command a wrapper runs, assignments before it left out. */
export function unwrapped(words: readonly string[]): readonly string[] {
  let rest = words;
  for (let guard = 0; guard < 8; guard += 1) {
    while (rest.length > 0 && (ASSIGNMENT.test(rest[0] ?? "") || RESERVED.has(rest[0] ?? "")))
      rest = rest.slice(1);
    const next = afterWrapper(rest);
    if (next === undefined) return rest;
    rest = next;
  }
  return rest;
}

/** git's global options that take the next word as their value. */
const GIT_VALUED = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--super-prefix",
  "--config-env",
]);

/**
 * The git invocations a command line runs, each with the directory steps
 * the `cd` commands before it and its own `-C` and `--work-tree` options
 * make; `sh -c`, `eval` and command substitutions are read as command lines
 * of their own. An alias git would expand is read as written.
 * @param line the command line as the harness reported it
 * @param depth how deep a nested shell this line is; 0 for the harness's own
 * @returns the invocations, in order
 */
export function gitInvocations(line: string, depth = 0): readonly GitInvocation[] {
  if (depth > DEPTH) return [];
  const out: GitInvocation[] = [];
  let dirs: readonly string[] = [];
  for (const simple of simpleCommands(line, depth)) {
    const words = unwrapped(simple);
    const program = programOf(words[0]);
    if (program === "cd" || program === "pushd") {
      const target = words.slice(1).find((word) => !word.startsWith("-"));
      if (target !== undefined) dirs = [...dirs, target];
      continue;
    }
    if (SHELLS.has(program) || program === "eval") {
      const flag = words.findIndex((word, at) => at > 0 && /^-[a-z]*c[a-z]*$/.test(word));
      const script =
        program === "eval" ? words.slice(1).join(" ") : flag === -1 ? undefined : words[flag + 1];
      if (script !== undefined)
        for (const inner of gitInvocations(script, depth + 1))
          out.push({ ...inner, dirs: [...dirs, ...inner.dirs] });
      continue;
    }
    if (program !== "git") continue;
    const read = gitWords(words);
    if (read === undefined) continue;
    out.push({ ...read, dirs: [...dirs, ...read.dirs] });
  }
  return out;
}

/**
 * One git command's words read past git's own options: the directories its
 * `-C` and `--work-tree` name, its subcommand and the arguments after it.
 * @param words the simple command's words, `git` first
 * @returns the invocation, its steps its own options' alone, or undefined where it names no subcommand
 */
function gitWords(words: readonly string[]): GitInvocation | undefined {
  const own: string[] = [];
  let at = 1;
  while (at < words.length && (words[at] ?? "").startsWith("-")) {
    const word = words[at] ?? "";
    const equals = word.indexOf("=");
    const name = equals === -1 ? word : word.slice(0, equals);
    if (GIT_VALUED.has(name)) {
      const value = equals === -1 ? words[at + 1] : word.slice(equals + 1);
      if ((name === "-C" || name === "--work-tree") && value !== undefined) own.push(value);
      at += equals === -1 ? 2 : 1;
    } else at += 1;
  }
  const subcommand = words[at];
  if (subcommand === undefined) return undefined;
  return { dirs: own, subcommand, args: words.slice(at + 1), text: words.join(" ") };
}

/** One `greenline sync` a command line runs (J-224 S1). */
export interface SyncInvocation {
  /** The `cd` steps before it, in order, each as written; an absolute one restarts. */
  readonly dirs: readonly string[];
  /** Whether it writes nothing: a dry run, or the usage `--help` and `-h` print. */
  readonly writesNothing: boolean;
  /** The invocation's words as one line, as a refusal quotes them. */
  readonly text: string;
}

/** Whether a word names greenline's CLI: the program on the PATH, its bin's file, or the package with a version. */
function namesCli(word: string): boolean {
  return (
    programOf(word)
      .replace(/(?<=.)@[^@/]*$/, "")
      .replace(/\.(?:mjs|cjs|js)$/, "") === "greenline"
  );
}

/**
 * A program that runs another command (J-224 S1, after the falsifier's
 * second reading): its options that take a value, so a value is never read
 * as the command; those whose value places the command, a directory it runs
 * the command in; those whose value is a script of its own; and the words
 * that open its command after its own options.
 */
interface Runner {
  readonly program: RegExp;
  readonly valued: readonly string[];
  readonly places: readonly string[];
  readonly scripts: readonly string[];
  readonly opens: readonly string[];
}

/**
 * The runners greenline's CLI is run through. Only the pnpm options `-C`
 * and `--dir` and the bun and yarn option `--cwd` place the command: npm
 * and npx run it in the caller's directory whatever their prefix or `-C`
 * says, bunx takes no directory, and the pnpx options are unverified, so
 * their values place nothing and are only read past.
 */
const RUNNERS: readonly Runner[] = [
  {
    program: /^pnpm$/,
    valued: ["-C", "--dir", "--filter", "-F"],
    places: ["-C", "--dir"],
    scripts: [],
    opens: ["exec", "dlx"],
  },
  { program: /^pnpx$/, valued: ["-C", "--dir", "--package"], places: [], scripts: [], opens: [] },
  {
    program: /^np[mx]$/,
    valued: ["--prefix", "-C", "-w", "--workspace", "--package", "-p", "-c", "--call"],
    places: [],
    scripts: ["-c", "--call"],
    opens: ["exec", "x"],
  },
  {
    program: /^yarn$/,
    valued: ["--cwd"],
    places: ["--cwd"],
    scripts: [],
    opens: ["exec", "dlx", "run"],
  },
  {
    program: /^bun$/,
    valued: ["--cwd"],
    places: ["--cwd"],
    scripts: [],
    opens: ["run", "x", "exec"],
  },
  { program: /^bunx$/, valued: ["--cwd", "-p", "--package"], places: [], scripts: [], opens: [] },
];

/** The interpreters that run greenline's bin as a file. */
const BIN_RUNNERS = /^(?:node|nodejs|tsx)$/;
/** Their options that take a value. */
const BIN_RUNNER_VALUED = [
  "-r",
  "--require",
  "--import",
  "--loader",
  "--experimental-loader",
  "-C",
  "--conditions",
];

/** One option read from the words at an index: its name, its value and the index after it. */
interface OptionRead {
  readonly name: string;
  readonly value: string | undefined;
  readonly next: number;
}

/** The option at an index, its value from `--name=value` or, where it takes one, the next word. */
function optionAt(words: readonly string[], at: number, valued: readonly string[]): OptionRead {
  const word = words[at] ?? "";
  const equals = word.startsWith("--") ? word.indexOf("=") : -1;
  if (equals !== -1)
    return { name: word.slice(0, equals), value: word.slice(equals + 1), next: at + 1 };
  return valued.includes(word)
    ? { name: word, value: words[at + 1], next: at + 2 }
    : { name: word, value: undefined, next: at + 1 };
}

/** The syncs a script of its own holds, each placed after the steps read before it. */
function scriptSyncs(
  script: string,
  steps: readonly string[],
  depth: number,
): readonly SyncInvocation[] {
  return greenlineSyncs(script, depth + 1).map((inner) => ({
    ...inner,
    dirs: [...steps, ...inner.dirs],
  }));
}

/** The options env gives a value. */
const ENV_VALUED = ["-C", "--chdir", "-u", "--unset", "-S"];

/**
 * The most readings of one simple command's options, and the most walks of
 * its words, the sync's reader follows (J-224 S1); past this bound, or past
 * {@link STEPS} programs in one walk, the command's words are read alone
 * ({@link wordsAloneSyncs}).
 */
const READINGS = 64;

/** The most programs, assignments and wrappers one walk of a command's words passes. */
const STEPS = 16;

/** Whether a reading of one command stopped at a bound of the reader's with work left unread. */
interface Bound {
  cut: boolean;
}

/** One way a run of options can be read: the index after it and the options it read, in order. */
interface OptionsEnd {
  readonly next: number;
  readonly options: readonly OptionRead[];
}

/**
 * The ways a run of options from an index can be read (J-224 S1, after the
 * falsifier's third reading): a listed option takes its value as
 * {@link optionAt} reads it; an option the list does not name may take one,
 * so where the word after it is no option, it is read both ways, as that
 * option's value and as the program's next word. Where `assignments` holds,
 * a `NAME=value` word is passed over as an option is, as env reads it.
 * @param words the command's words
 * @param from the index the run starts at
 * @param valued the options the program is known to give a value
 * @param bound marked cut where readings are left unread at {@link READINGS}
 * @param assignments whether an assignment among the options is passed over
 * @returns each reading, at most {@link READINGS}
 */
function optionRuns(
  words: readonly string[],
  from: number,
  valued: readonly string[],
  bound: Bound,
  assignments = false,
): readonly OptionsEnd[] {
  const out: OptionsEnd[] = [];
  const pending: OptionsEnd[] = [{ next: from, options: [] }];
  for (let reading = pending.pop(); reading !== undefined; reading = pending.pop()) {
    if (out.length >= READINGS) {
      bound.cut = true;
      break;
    }
    const word = words[reading.next];
    if (word !== undefined && assignments && ASSIGNMENT.test(word)) {
      pending.push({ next: reading.next + 1, options: reading.options });
      continue;
    }
    if (word === undefined || !word.startsWith("-") || word === "-") {
      out.push(reading);
      continue;
    }
    const option = optionAt(words, reading.next, valued);
    const after = words[reading.next + 1];
    // An option the list does not name may take the word after it as its value.
    if (
      option.value === undefined &&
      word !== "--" &&
      after !== undefined &&
      !after.startsWith("-")
    )
      pending.push({
        next: reading.next + 2,
        options: [...reading.options, { name: word, value: after, next: reading.next + 2 }],
      });
    pending.push({ next: option.next, options: [...reading.options, option] });
  }
  return out;
}

/** The values a reading gives the named options, in the order written. */
function valuesOf(options: readonly OptionRead[], names: readonly string[]): readonly string[] {
  return options.flatMap((option) =>
    names.includes(option.name) && option.value !== undefined ? [option.value] : [],
  );
}

/**
 * The sync one simple command runs (J-224 S1), read program by program from
 * its first word: an assignment, a wrapper, and `env` with `-C` or
 * `--chdir`; a shell's or `eval`'s script; a runner with its own options up
 * to its first word that is neither an option nor an option's value, the
 * words after it its command's; and then greenline's CLI by its name or its
 * bin's path, its verb `sync`. Each directory option is a step of the
 * program it belongs to, in the order written, and an option's value is
 * never read as the CLI's word. An option the program's list does not name
 * is read both ways, with a value and without, and a sync either reading
 * finds is a sync, each with its own steps, the same sync given once.
 * Where the reader stops at a bound of its own with words left unread, at
 * {@link READINGS} readings or walks or at {@link STEPS} programs in one
 * walk, it also reads the command's words alone, so no bound lets a sync
 * through (after the falsifier's fourth reading).
 * @param words the simple command's words
 * @param dirs the directory steps the line's `cd` commands made before it
 * @param depth how deep a nested shell this line is
 * @param text the command's words as a refusal quotes them
 * @returns the syncs, each once, or none
 */
function commandSyncs(
  words: readonly string[],
  dirs: readonly string[],
  depth: number,
  text: string,
): readonly SyncInvocation[] {
  const found: SyncInvocation[] = [];
  const bound: Bound = { cut: false };
  let walks = 0;
  // ran: inside a runner's command, where a shell's script is not read, as it was not before.
  const walk = (from: number, before: readonly string[], ran: boolean): void => {
    walks += 1;
    if (walks > READINGS) {
      bound.cut = true;
      return;
    }
    let steps = before;
    let at = from;
    for (let guard = 0; at < words.length; guard += 1) {
      if (guard >= STEPS) {
        bound.cut = true;
        return;
      }
      const word = words[at] ?? "";
      if (ASSIGNMENT.test(word) || RESERVED.has(word)) {
        at += 1;
        continue;
      }
      const program = programOf(word);
      if (program === "env") {
        for (const read of optionRuns(words, at + 1, ENV_VALUED, bound, true))
          walk(read.next, [...steps, ...valuesOf(read.options, ["-C", "--chdir"])], ran);
        return;
      }
      const wrapped = afterWrapper(words.slice(at));
      if (wrapped !== undefined) {
        at = words.length - wrapped.length;
        continue;
      }
      if (!ran && (SHELLS.has(program) || program === "eval")) {
        // The -c flag among flags of either case, `bash -Ec` among them.
        const flag = words.findIndex(
          (each, index) => index > at && /^-[A-Za-z]*c[A-Za-z]*$/.test(each),
        );
        const script =
          program === "eval"
            ? words.slice(at + 1).join(" ")
            : flag === -1
              ? undefined
              : words[flag + 1];
        if (script !== undefined) found.push(...scriptSyncs(script, steps, depth));
        return;
      }
      if (namesCli(word)) {
        const rest = words.slice(at + 1);
        const verb = rest.findIndex((each) => !each.startsWith("-") && !namesCli(each));
        if (rest[verb] !== "sync") return;
        const writesNothing = rest.some((each) => ["--dry-run", "--help", "-h"].includes(each));
        found.push({ dirs: steps, writesNothing, text });
        return;
      }
      if (BIN_RUNNERS.test(program)) {
        for (const read of optionRuns(words, at + 1, BIN_RUNNER_VALUED, bound))
          if (namesCli(words[read.next] ?? "")) walk(read.next, steps, ran);
        return;
      }
      const runner = RUNNERS.find((each) => each.program.test(program));
      if (runner === undefined) return;
      for (const read of runnerReads(runner, words, at + 1, steps, bound))
        if (read.script !== undefined) found.push(...scriptSyncs(read.script, read.steps, depth));
        else walk(read.next, read.steps, true);
      return;
    }
  };
  walk(0, dirs, false);
  // Past a bound the command's words are read alone, placed by the line's own steps.
  if (bound.cut) found.push(...wordsAloneSyncs(words, dirs, text));
  // Two readings that give the same sync give it once.
  return found.filter(
    (sync, index) =>
      found.findIndex(
        (other) =>
          other.writesNothing === sync.writesNothing &&
          other.dirs.join("\0") === sync.dirs.join("\0"),
      ) === index,
  );
}

/**
 * The syncs a command's words name read alone, past a bound of the reader's
 * (J-224 S1, after the falsifier's fourth reading): each word that names the
 * CLI, read as the walk reads the CLI's word, whose verb, the first word
 * after it that is no option and names no CLI, is `sync`, placed by the
 * line's own steps and none of the command's.
 */
function wordsAloneSyncs(
  words: readonly string[],
  dirs: readonly string[],
  text: string,
): readonly SyncInvocation[] {
  return words.flatMap((word, at) => {
    if (!namesCli(word)) return [];
    const rest = words.slice(at + 1);
    const verb = rest.findIndex((each) => !each.startsWith("-") && !namesCli(each));
    if (rest[verb] !== "sync") return [];
    const writesNothing = rest.some((each) => ["--dry-run", "--help", "-h"].includes(each));
    return [{ dirs, writesNothing, text }];
  });
}

/** What a runner's own options give: the index its command starts at, the steps, or a script of its own. */
interface RunnerRead {
  readonly next: number;
  readonly steps: readonly string[];
  readonly script?: string | undefined;
}

/** The script a reading's options give, the first script option's value. */
function scriptOf(runner: Runner, options: readonly OptionRead[]): string | undefined {
  return options.find(
    (option) => runner.scripts.includes(option.name) && option.value !== undefined,
  )?.value;
}

/**
 * The ways a runner's options from an index can be read: before its first
 * word that is neither an option nor an option's value, a placing option is
 * a step; that word, where it opens the runner's command (`exec`, `dlx` and
 * their kin), is passed with the options after it, which place nothing; a
 * script option's value is a command line of its own. An option the list
 * does not name is read both ways ({@link optionRuns}), and readings past
 * {@link READINGS} mark the bound cut.
 */
function runnerReads(
  runner: Runner,
  words: readonly string[],
  from: number,
  before: readonly string[],
  bound: Bound,
): readonly RunnerRead[] {
  const out: RunnerRead[] = [];
  for (const own of optionRuns(words, from, runner.valued, bound)) {
    const steps = [...before, ...valuesOf(own.options, runner.places)];
    const script = scriptOf(runner, own.options);
    if (script !== undefined) out.push({ next: own.next, steps, script });
    else if (!runner.opens.includes(words[own.next] ?? "")) out.push({ next: own.next, steps });
    else
      for (const after of optionRuns(words, own.next + 1, runner.valued, bound)) {
        const inner = scriptOf(runner, after.options);
        out.push(
          inner === undefined
            ? { next: after.next, steps }
            : { next: after.next, steps, script: inner },
        );
      }
  }
  if (out.length > READINGS) bound.cut = true;
  return out.slice(0, READINGS);
}

/**
 * The `greenline sync` invocations a command line runs (J-224 S1, the runs
 * j217t-states-stop and j217c-states-stop), in each form an agent runs the
 * CLI: bare or by its bin's path, through a runner of {@link RUNNERS}, and
 * node on the bin, a wrapper before any of them, each with the directory
 * steps the `cd` and `pushd` commands before it make and the directory
 * options of `env` and of the runners that place a command; a shell's
 * `-c`, `eval`, the script npx and npm exec take with `-c` or `--call`, and
 * command substitutions are read as command lines of their own. Only the
 * verb's place is read: the word `sync` another program holds, an argument
 * or a message, is no sync.
 * @param line the command line as the harness reported it
 * @param depth how deep a nested shell this line is; 0 for the harness's own
 * @returns the invocations, in order
 */
export function greenlineSyncs(line: string, depth = 0): readonly SyncInvocation[] {
  if (depth > DEPTH) return [];
  const out: SyncInvocation[] = [];
  let dirs: readonly string[] = [];
  for (const simple of simpleCommands(line, depth)) {
    const words = unwrapped(simple);
    const program = programOf(words[0]);
    if (program === "cd" || program === "pushd") {
      const args = words.slice(1);
      const target = args.find((word) => !word.startsWith("-"));
      if (target !== undefined) dirs = [...dirs, target];
      // A cd with no directory goes to the home, which the shell layer resolves.
      else if (program === "cd" && args.every((word) => word !== "-")) dirs = [...dirs, "~"];
      continue;
    }
    out.push(...commandSyncs(simple, dirs, depth, words.join(" ")));
  }
  return out;
}

/**
 * Whether the owner's words name the sync (J-224 S1): the word `sync` in
 * any case, never a word that only holds it. The words are read for the
 * name alone, never for a yes or a no.
 * @param words the owner's message
 * @returns true where it names the sync
 */
export function namesSync(words: string): boolean {
  return /(?<![\w-])sync(?![\w-])/i.test(words);
}

/**
 * The refusal of the agent's `greenline sync` in a checkout whose git
 * configuration registers none of greenline's hooks (J-224 S1): `ask` where
 * the owner's turns reach the hooks, so the sync goes on in the owner's next
 * turn or on their message naming it; `terminal` where none does, so the
 * owner runs it from their own terminal, as `push-from-terminal` says.
 * @param command the sync's words, as the refusal quotes them
 * @param form which way forward the refusal names
 * @returns the refusal's one line, its rule last
 */
export function syncWaitRefusal(command: string, form: "ask" | "terminal"): string {
  const quoted = command.length > 80 ? `${command.slice(0, 77)}...` : command;
  const what = `\`${quoted}\` would register greenline's git hooks in this checkout's git configuration, which registers none of them, and bring its installed files to the manifest, a change the owner decides`;
  return form === "ask"
    ? `${what}: tell the owner the hooks are not installed here and what the sync installs, ask, and run it on their word, in their next turn or now where their message names the sync; sync-on-word`
    : `${what}, and no turn of the owner's reached the hooks in this session to hold their word: tell the owner the hooks are not installed here and that they run greenline sync from their own terminal; sync-on-word`;
}

/** One path a command line's words name as a file it writes (J-173 S1). */
export interface ShellWrite {
  /** The `cd` steps before the command, in order, each as written; an absolute one restarts. */
  readonly dirs: readonly string[];
  /** The path as the words give it, relative to the last step or absolute. */
  readonly target: string;
  /** How the words write it, as the refusal says it. */
  readonly how:
    | "a redirection"
    | "a copy or a move"
    | "an edit in place"
    | "a removal"
    | "a script"
    | "a restore";
  /** The command's words as one line, as a refusal quotes them. */
  readonly command: string;
}

/** The interpreters whose script, given as an argument or as their input, may write any file it names. */
const INTERPRETER =
  /^(?:python[0-9.]*|pypy[0-9.]*|node|nodejs|deno|bun|ruby|perl|php|awk|gawk|mawk|nawk|lua|osascript|Rscript)$/;

/** The names a script's text gives the ledger's machine-written files and the ledger itself. */
const LEDGER_NAME =
  /(?:^|\/)(?:\.greenline\/|\.git\/greenline\/)|(?:^|\/)(?:marks\.jsonl|visuals\.json|frame-map\.json|paths\.json|design-pick\.json|lifts\.jsonl|[^/]+\.boxes\.json)$/;

/** One string literal of a script's text: where its text starts and ends, its quotes left out. */
interface Literal {
  readonly start: number;
  readonly end: number;
}

/**
 * The string literals of a script's text, in any of the interpreters' common
 * quotes (J-193 S1): a tripled `'''` or `"""` runs to its close over lines,
 * a backquote over lines too, and a single or a double quote to its close or
 * the line's end, a backslash escaping the character after it.
 */
function literalsOf(text: string): readonly Literal[] {
  const out: Literal[] = [];
  let at = 0;
  while (at < text.length) {
    const char = text[at] ?? "";
    if (char !== "'" && char !== '"' && char !== "`") {
      at += 1;
      continue;
    }
    const tripled = char !== "`" && text.startsWith(char.repeat(3), at);
    const close = tripled ? char.repeat(3) : char;
    const start = at + close.length;
    let end = start;
    while (end < text.length) {
      const here = text[end] ?? "";
      if (here === "\\") end += 2;
      else if (text.startsWith(close, end)) break;
      else if (!tripled && char !== "`" && here === "\n") break;
      else end += 1;
    }
    out.push({ start, end: Math.min(end, text.length) });
    at = Math.min(end, text.length) + (text.startsWith(close, end) ? close.length : 0);
  }
  return out;
}

/**
 * A string replacement's call, whose arguments are text it matches or puts
 * in, never a file it writes; `os.replace(`, a file's rename, is none.
 */
const REPLACEMENT = /(?:(?<!\bos)\.replace|\.replaceAll|\bre\.sub|\.sub|\.gsub)\s*\($/;

/** How far back the call around a literal is looked for, in characters. */
const CALL_REACH = 4000;

/** Whether a call whose parenthesis opens at an index holds two arguments or more, a comma at its own depth. */
function twoArguments(text: string, literals: readonly Literal[], open: number): boolean {
  let depth = 0;
  for (let at = open + 1; at < text.length; at += 1) {
    const inside = literals.find((each) => each.start <= at && at < each.end);
    if (inside !== undefined) {
      at = inside.end;
      continue;
    }
    const char = text[at];
    if (char === "(" || char === "[" || char === "{") depth += 1;
    else if (char === ")" || char === "]" || char === "}") {
      if (depth === 0) return false;
      depth -= 1;
    } else if (char === "," && depth === 0) return true;
  }
  return false;
}

/**
 * Whether a literal is an argument of a string replacement (J-227 S1,
 * j201t-visuals finding 6): the call whose parenthesis holds it, the nearest
 * one open before it over lines, is `.replace(`, `.replaceAll(`, `re.sub(`,
 * `.sub(` or `.gsub(` with two arguments or more, so a path's own
 * `Path(...).replace(<target>)` and `os.replace(...)`, which move a file,
 * stay writes.
 */
function replacementArgument(
  text: string,
  literals: readonly Literal[],
  literal: Literal,
): boolean {
  let depth = 0;
  const stop = Math.max(0, literal.start - CALL_REACH);
  for (let at = literal.start - 2; at >= stop; at -= 1) {
    const inside = literals.find((each) => each.start <= at && at < each.end);
    if (inside !== undefined) {
      at = inside.start - 1;
      continue;
    }
    const char = text[at];
    if (char === ")") depth += 1;
    else if (char === "(") {
      if (depth === 0)
        return (
          REPLACEMENT.test(text.slice(Math.max(0, at - 16), at + 1)) &&
          twoArguments(text, literals, at)
        );
      depth -= 1;
    }
  }
  return false;
}

/**
 * The paths a script names that it may write (J-173 S1, J-193 S1): each the
 * ledger's names hold, but one a string literal of prose only mentions, a
 * literal holding two words or more no path is part of, where the literal
 * read as a command line writes no file of that name, so a record's text
 * that names the visual home is no write of it; inside that literal a
 * backquoted span is text, never a command substitution (J-227 S1). A
 * literal that is an argument of a string replacement is data and names no
 * write (J-227 S1). A path standing alone in its literal, or outside every
 * literal, is read as before.
 */
function scriptWrites(text: string, depth: number): readonly string[] {
  const literals = literalsOf(text);
  const out: string[] = [];
  for (const match of text.matchAll(/[^\s'"`(),;{}[\]=<>|&]+/g)) {
    const token = match[0];
    if (!LEDGER_NAME.test(token)) continue;
    const at = match.index;
    const literal = literals.find((each) => each.start <= at && at + token.length <= each.end);
    // A string replacement's argument is the text it matches or puts in (J-227 S1).
    if (literal !== undefined && replacementArgument(text, literals, literal)) continue;
    const body = literal === undefined ? "" : text.slice(literal.start, literal.end);
    const words = body.split(/\s+/).filter((word) => word !== "" && !word.includes("/"));
    const prose = literal !== undefined && words.length >= 2;
    // Prose's backquoted spans are text it quotes, never commands it runs (J-227 S1).
    const said = body.replace(/`[^`]*`/g, (span) => " ".repeat(span.length));
    const written =
      prose &&
      shellWrites(said, depth + 1).some(
        (write) => write.target === token || write.target.endsWith(`/${token}`),
      );
    if (!prose || written) out.push(token);
  }
  return [...new Set(out)];
}

/** The operands of a command's words, options and their values left out; a `--` ends the options. */
function operandsOf(args: readonly string[], valued: ReadonlySet<string> = new Set()): string[] {
  const out: string[] = [];
  let ended = false;
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at] ?? "";
    if (ended || !arg.startsWith("-") || arg === "-") out.push(arg);
    else if (arg === "--") ended = true;
    else if (valued.has(arg)) at += 1;
  }
  return out;
}

/** The last segment of a path. */
function baseName(path: string): string {
  return path.replace(/\/+$/, "").slice(path.replace(/\/+$/, "").lastIndexOf("/") + 1);
}

/**
 * The files a copy or a move writes: its destination, and the file each
 * source becomes inside it where the destination reads as a directory, a
 * `-t` option's or one with a trailing `/` or no suffix; a move's sources
 * too, which it takes away.
 */
function copyTargets(program: string, args: readonly string[]): readonly string[] {
  const valued = new Set(["-t", "--target-directory", "-S", "--suffix", "-m", "-o", "-g"]);
  const flag = args.findIndex((arg) => arg === "-t" || arg === "--target-directory");
  const joined = args.find((arg) => arg.startsWith("--target-directory="));
  const operands = operandsOf(args, valued);
  const into = flag === -1 ? joined?.slice("--target-directory=".length) : args[flag + 1];
  if (into !== undefined)
    return [
      ...operands.map((source) => `${into.replace(/\/+$/, "")}/${baseName(source)}`),
      ...(program === "mv" ? operands : []),
    ];
  const destination = operands.at(-1);
  const sources = operands.slice(0, -1);
  if (destination === undefined || sources.length === 0) return [];
  const directory =
    destination.endsWith("/") || sources.length > 1 || !/\.[^/]+$/.test(baseName(destination));
  return [
    ...(program === "mv" ? sources : []),
    destination,
    ...(directory
      ? sources.map((source) => `${destination.replace(/\/+$/, "")}/${baseName(source)}`)
      : []),
  ];
}

/** The files `sed -i` edits in place: its operands after the script, none without `-i`. */
function sedTargets(args: readonly string[]): readonly string[] {
  let inPlace = false;
  let script = false;
  const files: string[] = [];
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at] ?? "";
    if (arg === "-i" || arg === "--in-place") {
      inPlace = true;
      // BSD's sed takes the backup suffix as the next word, an empty one among them.
      if (args[at + 1] === "" || /^\.\w+$/.test(args[at + 1] ?? "")) at += 1;
    } else if (/^-i./.test(arg) || arg.startsWith("--in-place=")) inPlace = true;
    else if (arg === "-e" || arg === "-f" || arg === "--expression" || arg === "--file") {
      script = true;
      at += 1;
    } else if (arg.startsWith("-") && arg !== "-") continue;
    else if (!script) script = true;
    else files.push(arg);
  }
  return inPlace ? files : [];
}

/** The options of restore and checkout that take the next word as their value. */
const RESTORE_VALUED: ReadonlySet<string> = new Set([
  "-s",
  "--source",
  "--conflict",
  "--pathspec-from-file",
]);

/**
 * The working-tree paths a git invocation writes back (J-227 S1, j217c-conduct-runner
 * finding 2): a `git restore`'s operands, unless it restores the index alone
 * with `--staged`, and the paths after `--` in a `git checkout`. A branch
 * checkout, a switch and a merge carry files by git's own rules and write
 * none here.
 * @param invocation the invocation, its steps its own options'
 * @returns the paths as the words give them
 */
function restoredPaths(invocation: GitInvocation): readonly string[] {
  const { subcommand, args } = invocation;
  if (subcommand === "checkout") {
    const ended = args.indexOf("--");
    return ended === -1 ? [] : args.slice(ended + 1).filter((arg) => arg !== "");
  }
  if (subcommand !== "restore") return [];
  const { options } = split(args);
  const staged = options.some((option) => option === "--staged" || cluster(option, "S", "s"));
  const tree = options.some((option) => option === "--worktree" || cluster(option, "W", "s"));
  if (staged && !tree) return [];
  return operandsOf(args, RESTORE_VALUED).filter((arg) => arg !== "");
}

/** What a simple command's words write, by its program, beside its redirections. */
function programWrites(
  words: readonly string[],
  stdin: string | undefined,
  depth: number,
): readonly { readonly target: string; readonly how: ShellWrite["how"] }[] {
  const program = programOf(words[0]);
  const args = words.slice(1);
  const each = (targets: readonly string[], how: ShellWrite["how"]) =>
    targets.filter((target) => target !== "").map((target) => ({ target, how }));
  if (program === "tee" || program === "sponge") return each(operandsOf(args), "a redirection");
  if (program === "cp" || program === "mv" || program === "install" || program === "ln")
    return each(copyTargets(program, args), "a copy or a move");
  if (program === "rm" || program === "unlink" || program === "shred" || program === "touch")
    return each(operandsOf(args), "a removal");
  if (program === "truncate")
    return each(operandsOf(args, new Set(["-s", "--size", "-r", "--reference"])), "a removal");
  if (program === "sed") return each(sedTargets(args), "an edit in place");
  if (program === "dd")
    return each(
      args.filter((arg) => arg.startsWith("of=")).map((arg) => arg.slice(3)),
      "a redirection",
    );
  if (INTERPRETER.test(program))
    return each(scriptWrites([...args, stdin ?? ""].join("\n"), depth), "a script");
  return [];
}

/** The writes a git command's restore makes, each with the steps its own `-C` adds. */
function gitWrites(
  words: readonly string[],
): readonly { readonly own: readonly string[]; readonly target: string }[] {
  const invocation = gitWords(words);
  if (invocation === undefined) return [];
  return restoredPaths(invocation).map((target) => ({ own: invocation.dirs, target }));
}

/**
 * The files a command line's words name as written (J-173 S1): a
 * redirection's file, the operands of tee, a copy, a move, a removal and an
 * edit in place, dd's `of=`, and every path an interpreter's script names
 * that can be the ledger's, the script given as an argument or as its input
 * by a here-document; each with the `cd` steps before it, `sh -c`, `eval`
 * and command substitutions read as command lines of their own. A `git
 * restore` of working-tree paths and the paths after `--` in a `git
 * checkout` are writes of those paths (J-227 S1); every other git act and
 * greenline write by their own rules and are not read here. A script the
 * words do not hold, a file an interpreter runs or a path a script builds
 * from parts, is beyond what the words show.
 * @param line the command line as the harness reported it
 * @param depth how deep a nested shell this line is; 0 for the harness's own
 * @returns the writes, in order
 */
export function shellWrites(line: string, depth = 0): readonly ShellWrite[] {
  if (depth > DEPTH) return [];
  const out: ShellWrite[] = [];
  let dirs: readonly string[] = [];
  for (const simple of shellCommands(line, depth)) {
    const words = unwrapped(simple.words);
    const program = programOf(words[0]);
    const command = words.join(" ");
    for (const target of simple.writes ?? [])
      out.push({ dirs, target, how: "a redirection", command });
    if (program === "cd" || program === "pushd") {
      const target = words.slice(1).find((word) => !word.startsWith("-"));
      if (target !== undefined) dirs = [...dirs, target];
      continue;
    }
    if (SHELLS.has(program) || program === "eval") {
      const flag = words.findIndex((word, at) => at > 0 && /^-[a-z]*c[a-z]*$/.test(word));
      const script =
        program === "eval" ? words.slice(1).join(" ") : flag === -1 ? undefined : words[flag + 1];
      if (script !== undefined)
        for (const inner of shellWrites(script, depth + 1))
          out.push({ ...inner, dirs: [...dirs, ...inner.dirs] });
      continue;
    }
    // A restore of working-tree paths is a write of each (J-227 S1).
    if (program === "git") {
      for (const write of gitWrites(words))
        out.push({
          dirs: [...dirs, ...write.own],
          target: write.target,
          how: "a restore",
          command,
        });
      continue;
    }
    for (const write of programWrites(words, simple.stdin, depth))
      out.push({ dirs, ...write, command });
  }
  return out;
}

/** The arguments split into options and operands; a `--` ends the options. */
/** The arguments of a git invocation, its options apart from its operands. */
interface Split {
  readonly options: readonly string[];
  readonly operands: readonly string[];
}

function split(args: readonly string[]): Split {
  const options: string[] = [];
  const operands: string[] = [];
  let ended = false;
  for (const arg of args) {
    if (ended) operands.push(arg);
    else if (arg === "--") ended = true;
    else if (arg.startsWith("-") && arg !== "-") options.push(arg);
    else operands.push(arg);
  }
  return { options, operands };
}

/**
 * Whether a cluster of short options carries the letter, read up to a
 * letter whose value runs on after it.
 * @param option the option as written, such as `-fd`
 * @param letter the letter
 * @param valued the letters that take a value
 * @returns true when the cluster holds it
 */
function cluster(option: string, letter: string, valued = ""): boolean {
  if (!/^-[^-]/.test(option)) return false;
  for (const char of option.slice(1)) {
    if (char === letter) return true;
    if (valued.includes(char)) return false;
  }
  return false;
}

/** A pathspec that names the whole tree. */
const WHOLE_TREE = new Set([".", "./", ":/", ":/.", "*", ":(top)", ":(top)."]);
/** The options of push that take the next word as their value. */
const PUSH_VALUED = new Set(["-o", "--push-option", "--receive-pack", "--exec", "--repo"]);
/** The options that force a push. */
const PUSH_FORCED = new Set(["--force", "--force-with-lease", "--force-if-includes", "--mirror"]);
/** The options that push many branches at once. */
const PUSH_MANY = new Set(["--all", "--branches", "--mirror", "--tags"]);

function pushAct(args: readonly string[], command: string): GuardAct {
  const positional: string[] = [];
  let forced = false;
  let many = false;
  let deleting = false;
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at] ?? "";
    if (arg === "--") {
      positional.push(...args.slice(at + 1));
      break;
    }
    if (!arg.startsWith("-") || arg === "-") {
      positional.push(arg);
      continue;
    }
    const name = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (PUSH_VALUED.has(name)) {
      if (!arg.includes("=")) at += 1;
      continue;
    }
    if (PUSH_FORCED.has(name) || cluster(arg, "f", "o")) forced = true;
    if (PUSH_MANY.has(name)) many = true;
    if (name === "--delete" || cluster(arg, "d", "o")) deleting = true;
  }
  const refspecs = positional.slice(1);
  const short = (ref: string): string =>
    ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
  const targets = refspecs.map((spec) => {
    const colon = spec.indexOf(":");
    return short(colon === -1 ? spec.replace(/^\+/, "") : spec.slice(colon + 1));
  });
  const sources = refspecs.map((spec) => {
    const colon = spec.indexOf(":");
    return short((colon === -1 ? spec : spec.slice(0, colon)).replace(/^\+/, ""));
  });
  if (forced || refspecs.some((spec) => spec.startsWith("+")))
    return many
      ? { kind: "force-push", command, targets: null, sources: null }
      : { kind: "force-push", command, targets, sources };
  if (many) return { kind: "push", command, targets: null, sources: null };
  // A deletion is never the change's own push: `--delete <branch>` or `:<branch>`.
  if (deleting || refspecs.some((spec) => spec.startsWith(":")))
    return { kind: "push", command, targets: null, sources: null };
  return { kind: "push", command, targets, sources };
}

/**
 * The branches an act names by their own name (J-188 S1): a push's or a
 * forced push's target pushed from the branch of that name, and a forced
 * delete's branches. A target another source is pushed to, `HEAD`, a
 * deletion and a push of many branches at once name none, and every other
 * act names none.
 * @param act the act
 * @returns the branches, in the command's order
 */
export function namedBranches(act: GuardAct): readonly string[] {
  switch (act.kind) {
    case "branch-delete":
      return act.branches;
    case "push":
    case "force-push": {
      const { targets, sources } = act;
      if (targets === null || sources === null || sources === undefined) return [];
      return targets.filter((target, at) => target !== "HEAD" && sources[at] === target);
    }
    case "discard":
      return [];
  }
}

/**
 * The act one git invocation is among those the guardrails refuse, or
 * undefined for every other: a hard reset, a forced clean, a checkout or a
 * restore of the whole tree to the working copy, a forced branch delete,
 * and any push, which the place then judges.
 * @param invocation the invocation
 * @returns the act, or undefined
 */
export function guardAct(invocation: GitInvocation): GuardAct | undefined {
  const { subcommand, args, text } = invocation;
  const { options, operands } = split(args);
  switch (subcommand) {
    case "reset":
      return options.includes("--hard") ? { kind: "discard", command: text } : undefined;
    case "clean": {
      const force = options.some((option) => option === "--force" || cluster(option, "f", "e"));
      const dry = options.some((option) => option === "--dry-run" || cluster(option, "n", "e"));
      return force && !dry ? { kind: "discard", command: text } : undefined;
    }
    case "checkout":
      return operands.some((operand) => WHOLE_TREE.has(operand))
        ? { kind: "discard", command: text }
        : undefined;
    case "restore": {
      const staged = options.some((option) => option === "--staged" || cluster(option, "S", "s"));
      const tree = options.some((option) => option === "--worktree" || cluster(option, "W", "s"));
      if (staged && !tree) return undefined;
      return operands.some((operand) => WHOLE_TREE.has(operand))
        ? { kind: "discard", command: text }
        : undefined;
    }
    case "branch": {
      const forced =
        options.some((option) => cluster(option, "D")) ||
        (options.some((option) => option === "--delete" || cluster(option, "d")) &&
          options.some((option) => option === "--force" || cluster(option, "f")));
      return forced ? { kind: "branch-delete", command: text, branches: operands } : undefined;
    }
    case "push":
      return pushAct(args, text);
    default:
      return undefined;
  }
}

/**
 * What a line's words lifted (J-173 S1): one discard, a hard reset or a
 * forced clean; one landing, the change's pushes and the push to its base;
 * one forced push; and a forced branch delete, a discard's or a landing's
 * cleanup.
 */
export type LiftKind = "discard" | "landing" | "force-push" | "branch-delete";

/**
 * One lift a record's line spent (J-173 S1): the line, its words as the
 * committed record held them, what they lifted and the command, so a resume
 * never spends the same words on another act.
 */
export interface SpentLift {
  readonly line: GuardLine;
  readonly words: string;
  readonly act: LiftKind;
  readonly command: string;
  readonly at: string;
}

/** What an act spends its line on. */
export function liftKindOf(act: GuardAct): LiftKind {
  switch (act.kind) {
    case "discard":
      return "discard";
    case "branch-delete":
      return "branch-delete";
    case "force-push":
      return "force-push";
    case "push":
      return "landing";
  }
}

/**
 * Whether words already spent on these lifts may lift an act of this kind:
 * a discard and a forced push take words nothing has spent, a landing's
 * pushes share theirs, and a branch delete follows a discard or a landing
 * on the same words.
 */
function stillLifts(kind: LiftKind, spent: readonly LiftKind[]): boolean {
  switch (kind) {
    case "discard":
    case "force-push":
      return spent.length === 0;
    case "landing":
      return spent.every((each) => each === "landing" || each === "branch-delete");
    case "branch-delete":
      return spent.every((each) => each !== "force-push");
  }
}

/**
 * Whether the owner's words name a branch (J-148 S2): a word of theirs is
 * the branch's name, a trailing full stop aside.
 * @param words the owner's words
 * @param branch the branch's name
 * @returns true where they name it
 */
export function wordsName(words: string, branch: string): boolean {
  return words
    .split(/[^A-Za-z0-9/._-]+/)
    .some((word) => word === branch || word.replace(/[.]+$/, "") === branch);
}

/** The record's lines the guardrails read, each the owner's words or absent. */
export interface GuardWords {
  readonly discard?: string | undefined;
  readonly rebase?: string | undefined;
  readonly landing?: string | undefined;
}

/**
 * Where an act runs: the branch HEAD names there, and the change whose record
 * can lift it. A line lifts an act only from the committed record (J-129 S4,
 * the operator's card "Committed before the act"): `words` are the lines a
 * commit holds, and `uncommitted` the lines the working tree's record holds
 * that no commit does yet, which lift nothing and only shape the refusal.
 */
export interface GuardPlace {
  readonly branch: string | undefined;
  /** The change of that branch, its record's path and its lines; undefined while none is open there. */
  readonly change:
    | {
        readonly id: string;
        readonly record: string;
        readonly words: GuardWords | undefined;
        readonly uncommitted?: GuardWords | undefined;
        /** The record's state as a commit holds it, which a push to the default branch reads (J-139 S1). */
        readonly state?: string | undefined;
        /** The lifts its lines already spent, each by the words it was spent with (J-173 S1). */
        readonly spent?: readonly SpentLift[] | undefined;
      }
    | undefined;
  /** Whether a branch is the remote's default branch; none is where unread. */
  readonly isDefault?: ((branch: string) => boolean) | undefined;
  /** The owner's messages the hooks journaled for the session, which a lifting line's words stand in (J-176 S1); none kept where no hook saw the owner's text. */
  readonly journal?: OwnerJournal | undefined;
}

/**
 * The rule a refusal names after its words, for the agent and the viewer,
 * never first (J-144 S3): one per act, and the push before the close.
 */
export type GuardRule =
  | "discard-words"
  | "branch-delete-words"
  | "force-push-words"
  | "push-elsewhere-words"
  | "push-before-close"
  | "owned-words"
  | "push-from-terminal"
  | "sync-on-word";

/** The rule of the lines an act needs. */
function ruleOf(act: GuardAct): GuardRule {
  switch (act.kind) {
    case "discard":
      return "discard-words";
    case "branch-delete":
      return "branch-delete-words";
    case "force-push":
      return "force-push-words";
    case "push":
      return "push-elsewhere-words";
  }
}

/**
 * The refusal of a push that carries a change to the default branch before
 * its close (J-139 S1): the record not `done` in a commit, whatever its
 * landing line holds, since an ask to push an unfinished change there is
 * not the words for the landing.
 */
function earlyPush(act: GuardAct, place: GuardPlace): string | undefined {
  if (
    (act.kind !== "push" && act.kind !== "force-push") ||
    act.targets === null ||
    place.change === undefined
  )
    return undefined;
  const target = act.targets.find((branch) => place.isDefault?.(branch) === true);
  const { id, state } = place.change;
  if (target === undefined || state === "done") return undefined;
  return `\`${act.command}\` would put change ${id} on ${target}, the default branch, before its review, verify and close, since its record ${state === undefined ? "is in no commit with a state" : `stands ${state} in its last commit`}; finish the close first, and an ask to push it there is not the landing's words, so name what the push skips and ask for the close; push-before-close`;
}

/**
 * The default branch a push writes, or undefined (J-176 S1): a target the
 * remote holds as its default, or the change's own branch where it is the
 * default, a change built in place on the default branch.
 */
function defaultTarget(act: GuardAct, place: GuardPlace): string | undefined {
  if (act.kind !== "push" && act.kind !== "force-push") return undefined;
  if (act.targets === null) return undefined;
  const named = act.targets.find((branch) => place.isDefault?.(branch) === true);
  if (named !== undefined) return named;
  const own = act.targets.every((target) => target === place.branch || target === "HEAD");
  return own && place.branch !== undefined && place.isDefault?.(place.branch) === true
    ? place.branch
    : undefined;
}

/**
 * The refusal of a lift whose words are not the owner's (J-176 S1): a push
 * to the default branch where no hook saw the owner's text, and a lifting
 * line whose words no journaled message of the owner's holds.
 * @param act the act
 * @param place where it runs
 * @param lines the lines that lift it
 * @returns the refusal's line, or undefined where the words are the owner's
 */
function unownedLift(
  act: GuardAct,
  place: GuardPlace,
  lines: readonly GuardLine[],
): string | undefined {
  const target = defaultTarget(act, place);
  const journal = place.journal;
  if (target !== undefined && journal?.kept !== true)
    return `\`${act.command}\` would push to ${target}, the default branch, and no message of the owner's reached the hooks in this session to hold the landing's words; the owner pushes it from their own terminal; push-from-terminal`;
  if (journal?.kept !== true) return undefined;
  const record = place.change?.record ?? "the record";
  for (const line of lines) {
    const said = place.change?.words?.[line];
    if (said !== undefined && !saidByOwner(said, journal.messages))
      return `\`${act.command}\` ${done(act)}, and the ${line} line of ${record} says "${said}", ${unownedWords(said, journal.messages)}; a line lifts an act only in the owner's own words, so ask the owner, quote their words there and commit the record alone first; owned-words`;
  }
  return undefined;
}

/** Whether a push's targets are the change's own branch alone: none named, HEAD, or the branch HEAD names. */
function ownTargets(targets: readonly string[] | null, place: GuardPlace): boolean {
  return (
    targets !== null &&
    place.change !== undefined &&
    place.branch !== undefined &&
    targets.every((target) => target === place.branch || target === "HEAD")
  );
}

/**
 * The record lines an act needs, all of them: a discard needs the discard
 * line; a forced branch delete the discard or the landing line, the
 * landing's cleanup; a forced push the landing line given for it, never the
 * rebase line (J-173 S1); a push to a branch other than the change's the
 * landing line. A plain push of the change's own branch needs none here:
 * git's pre-push hook holds it to the landing line.
 */
function needs(act: GuardAct, place: GuardPlace): readonly (readonly GuardLine[])[] {
  switch (act.kind) {
    case "discard":
      return [["discard"]];
    case "branch-delete":
      return [["discard", "landing"]];
    case "force-push":
      return [["landing"]];
    case "push":
      return ownTargets(act.targets, place) ? [] : [["landing"]];
  }
}

/** The branches other than the change's own a forced push writes over, which its landing words must name; `null` for many at once. */
function namedTargets(act: GuardAct, place: GuardPlace): readonly string[] | null {
  if (act.kind !== "force-push") return [];
  if (act.targets === null) return null;
  return ownTargets(act.targets, place)
    ? []
    : act.targets.filter((target) => target !== place.branch && target !== "HEAD");
}

/** What an act's verdict is: refused with its one line, or lifted by the lines it spends. */
export type GuardVerdict =
  | { readonly kind: "refuse"; readonly reason: string }
  | { readonly kind: "lift"; readonly lines: readonly GuardLine[] };

/** What an act would do, as the refusal says it. */
function done(act: GuardAct): string {
  switch (act.kind) {
    case "discard":
      return "would throw uncommitted work away";
    case "branch-delete":
      return "would delete a branch whatever it holds";
    case "force-push":
      return "would push over a branch's history";
    case "push":
      return "would push to a branch other than the change's";
  }
}

/** The lines as the refusal names them: `discard`, `discard or landing`, `rebase and landing`. */
function named(groups: readonly (readonly GuardLine[])[]): string {
  return groups.map((group) => group.join(" or ")).join(" and ");
}

/**
 * The refusal of an act, or undefined where the record's lines lift it:
 * every group of lines the act needs has one line holding words in the
 * record HEAD's commit holds, and that record does not stand stopped there
 * (J-144 S4), so a stopped record set open in the working tree alone lifts
 * nothing. Each refusal leads with what the act would do and what lifts
 * it, its rule's name after a semicolon (J-144 S3).
 * @param act the act
 * @param place where it runs, and the change whose record can lift it
 * @returns the refusal's one line, naming the committed line that lifts it, or undefined
 */
export function guardRefusal(act: GuardAct, place: GuardPlace): string | undefined {
  const verdict = guardLift(act, place);
  return verdict.kind === "refuse" ? verdict.reason : undefined;
}

/**
 * The verdict on an act (J-173 S1): refused with its one line, or lifted
 * by the lines it spends. A line lifts only the act it was given for: its
 * words, as the record HEAD's commit holds them, lift no act of another
 * kind once they lifted one (`spent`), a discard and a forced push take
 * words nothing has spent, a landing's pushes and its branch's delete
 * share theirs, and a forced push over a branch other than the change's
 * takes landing words that name that branch. The change's own plain push
 * needs no line here and spends its landing line where one stands, so a
 * forced push after it reads those words spent. The record's stopped
 * state, the working tree's words and a missing line are refused as
 * {@link guardRefusal} names them.
 * @param act the act
 * @param place where it runs, the change whose record can lift it and what its lines spent
 * @returns the verdict
 */
export function guardLift(act: GuardAct, place: GuardPlace): GuardVerdict {
  const refuse = (reason: string): GuardVerdict => ({ kind: "refuse", reason });
  const early = earlyPush(act, place);
  if (early !== undefined) return refuse(early);
  const groups = needs(act, place);
  const words = place.change?.words;
  const kind = liftKindOf(act);
  const spentOn = (line: GuardLine, held: string): readonly SpentLift[] =>
    (place.change?.spent ?? []).filter((each) => each.line === line && each.words === held);
  const others = namedTargets(act, place);
  const usable = (line: GuardLine, held: GuardWords | undefined): boolean => {
    const said = held?.[line];
    if (said === undefined) return false;
    if (
      !stillLifts(
        kind,
        spentOn(line, said).map((each) => each.act),
      )
    )
      return false;
    return (
      line !== "landing" || (others !== null && others.every((branch) => wordsName(said, branch)))
    );
  };
  const chosen = (held: GuardWords | undefined): readonly (GuardLine | undefined)[] =>
    groups.map((group) => group.find((line) => usable(line, held)));
  const stopped = place.change?.state === "stopped";
  const picked = chosen(words);
  if (groups.length === 0) {
    const lines: readonly GuardLine[] =
      words?.landing === undefined || place.change === undefined ? [] : ["landing"];
    const unowned = unownedLift(act, place, lines);
    return unowned === undefined ? { kind: "lift", lines } : refuse(unowned);
  }
  if (picked.every((line) => line !== undefined) && !stopped) {
    const lines = picked.filter((line) => line !== undefined);
    const unowned = unownedLift(act, place, lines);
    return unowned === undefined ? { kind: "lift", lines } : refuse(unowned);
  }
  const lines = named(groups);
  const plural = groups.length > 1 || (groups[0]?.length ?? 0) > 1 ? "lines" : "line";
  const what = `\`${act.command}\` ${done(act)}`;
  const rule = ruleOf(act);
  if (others === null)
    return refuse(
      `${what}, and it pushes many branches at once, which no line of a record lifts; the owner runs it; ${rule}`,
    );
  if (place.change === undefined)
    return refuse(
      `${what}, and no change is open on ${place.branch ?? "a detached HEAD"} to hold the owner's word for it; the owner runs it, or a change opens whose committed record holds their words in its ${lines} ${plural}; ${rule}`,
    );
  const { record, uncommitted } = place.change;
  if (stopped)
    return refuse(
      `${what}, and change ${place.change.id} stands stopped in its last commit, so no line of ${record} lifts it, whatever the working tree says; resume the change and commit its record open with the owner's words in its ${lines} ${plural} first, \`${commitFirst(record)}\`, then run it again; ${rule}`,
    );
  // The words stand in the working tree alone: the refusal names the commit that makes them lift.
  const either: GuardWords | undefined =
    uncommitted === undefined
      ? undefined
      : {
          discard: usable("discard", words)
            ? words?.discard
            : (uncommitted.discard ?? words?.discard),
          rebase: usable("rebase", words) ? words?.rebase : (uncommitted.rebase ?? words?.rebase),
          landing: usable("landing", words)
            ? words?.landing
            : (uncommitted.landing ?? words?.landing),
        };
  if (uncommitted !== undefined && chosen(either).every((line) => line !== undefined)) {
    // Each group the commit lacks, named by the line the working tree holds for it.
    const missing = groups
      .filter((group) => !group.some((line) => usable(line, words)))
      .map((group) => group.filter((line) => uncommitted[line] !== undefined));
    const many = missing.length > 1 || (missing[0]?.length ?? 0) > 1;
    return refuse(
      `${what}, and the owner's words in the ${named(missing)} ${many ? "lines" : "line"} of ${record} stand only in the working tree, where the act could throw them away; commit the record first, \`${commitFirst(record)}\`, then run it again; ${rule}`,
    );
  }
  // The words stand committed and another act spent them: the refusal names that act.
  for (const group of groups)
    for (const line of group) {
      const said = words?.[line];
      const spent = said === undefined ? [] : spentOn(line, said);
      if (
        said !== undefined &&
        !stillLifts(
          kind,
          spent.map((each) => each.act),
        )
      )
        return refuse(
          `${what}, and the owner's words in the ${line} line of ${record}, "${said}", were spent on \`${spent[0]?.command ?? ""}\`; a line lifts only the act it was given for, so ask the owner for this one, write their words there and commit the record alone first, then run it again; ${rule}`,
        );
    }
  // The landing words stand, unspent, and do not name the branch the forced push writes over.
  const unnamed = others.find((branch) => !wordsName(words?.landing ?? "", branch));
  if (words?.landing !== undefined && unnamed !== undefined)
    return refuse(
      `${what}, and the owner's words in the landing line of ${record}, "${words.landing}", do not name ${unnamed}, the branch it pushes over; ask the owner once, naming ${unnamed}, write their words there and commit the record alone first, then run it again; ${rule}`,
    );
  return refuse(
    `${what}, and ${record} holds no ${lines} ${plural} with the owner's words for it in a commit; ask the owner, write their words there and commit the record alone first, then run it again; ${rule}`,
  );
}

/**
 * The commit that makes a record's owner-words lines lift an act: the
 * record alone, as a stop commits it.
 * @param record the record's path from the root
 * @returns the command
 */
export function commitFirst(record: string): string {
  return `git commit -m "record the owner's words" -- ${record}`;
}
